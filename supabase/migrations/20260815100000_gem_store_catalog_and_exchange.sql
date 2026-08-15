-- Real-money catalog products grant Gems only. Points remain an earned and
-- spendable gameplay currency, obtained through the configured Gem exchange.

alter table public.store_items
  add column if not exists gem_amount integer not null default 0,
  add column if not exists apple_product_id text,
  add column if not exists google_product_id text;

comment on column public.store_items.gem_amount is
  'Number of Gems credited after a verified Apple App Store or Google Play purchase. Used only when category = currency.';
comment on column public.store_items.apple_product_id is
  'Apple App Store consumable product identifier for this Gem pack.';
comment on column public.store_items.google_product_id is
  'Google Play one-time product identifier for this Gem pack.';

alter table public.store_items
  drop constraint if exists store_items_currency_gem_pack_check,
  add constraint store_items_currency_gem_pack_check check (
    category <> 'currency'
    or (
      price_currency = 'fiat_usd'
      and coalesce(price_fiat, 0) > 0
      and gem_amount > 0
    )
  ) not valid;

create unique index if not exists store_items_apple_product_id_unique
  on public.store_items (apple_product_id)
  where apple_product_id is not null;

create unique index if not exists store_items_google_product_id_unique
  on public.store_items (google_product_id)
  where google_product_id is not null;

-- Starter catalog. These are deliberately inactive until the matching
-- consumable products have been created in both store consoles and their IDs
-- are entered by an administrator.
insert into public.store_items (
  name, description, sku, category, price_points, price_fiat, price_currency,
  gem_amount, stock_quantity, image_url, is_active
)
values
  ('100 Gems', '100 Gems to exchange for gameplay Points.', 'GEM_PACK_100', 'currency', 0, 0.99, 'fiat_usd', 100, -1, 'https://img.icons8.com/color/96/gemstone.png', false),
  ('500 Gems', '500 Gems to exchange for gameplay Points.', 'GEM_PACK_500', 'currency', 0, 4.99, 'fiat_usd', 500, -1, 'https://img.icons8.com/color/96/gemstone.png', false),
  ('1,000 Gems', '1,000 Gems to exchange for gameplay Points.', 'GEM_PACK_1000', 'currency', 0, 9.99, 'fiat_usd', 1000, -1, 'https://img.icons8.com/color/96/gemstone.png', false),
  ('2,500 Gems', '2,500 Gems to exchange for gameplay Points.', 'GEM_PACK_2500', 'currency', 0, 19.99, 'fiat_usd', 2500, -1, 'https://img.icons8.com/color/96/gemstone.png', false),
  ('6,500 Gems', '6,500 Gems to exchange for gameplay Points.', 'GEM_PACK_6500', 'currency', 0, 49.99, 'fiat_usd', 6500, -1, 'https://img.icons8.com/color/96/gemstone.png', false)
on conflict (sku) do nothing;

alter table public.platform_config
  add column if not exists gem_exchange_gem_cost integer not null default 1,
  add column if not exists gem_exchange_points_reward integer not null default 100;

alter table public.platform_config
  drop constraint if exists platform_config_gem_exchange_gem_cost_check,
  add constraint platform_config_gem_exchange_gem_cost_check
    check (gem_exchange_gem_cost > 0),
  drop constraint if exists platform_config_gem_exchange_points_reward_check,
  add constraint platform_config_gem_exchange_points_reward_check
    check (gem_exchange_points_reward > 0);

-- Public player read model for the exchange screen. The values are configured
-- exclusively in the admin platform settings page.
create or replace function public.get_gem_exchange_config()
returns table(gem_cost integer, points_reward integer)
language sql
security definer
set search_path = public
as $$
  select gem_exchange_gem_cost, gem_exchange_points_reward
  from public.platform_config
  where id = 1;
$$;

-- Atomic, server-authoritative conversion. A player cannot choose the rate,
-- alter a client-side wallet value, or spend another player's Gems.
create or replace function public.exchange_gems_for_points(
  p_quantity integer default 1
)
returns table(
  gems_spent integer,
  points_received integer,
  new_gems_balance integer,
  new_points_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.platform_config;
  player public.profiles;
  v_gems_spent integer;
  v_points_received integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to exchange Gems';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Exchange quantity must be between 1 and 100';
  end if;

  select * into cfg from public.platform_config where id = 1;
  if not found then
    raise exception 'Gem exchange settings are unavailable';
  end if;

  select * into player from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  v_gems_spent := cfg.gem_exchange_gem_cost * p_quantity;
  v_points_received := cfg.gem_exchange_points_reward * p_quantity;
  if coalesce(player.gems, 0) < v_gems_spent then
    raise exception 'Not enough Gems for this exchange';
  end if;

  perform set_config('app.wallet_activity_type', 'gem_to_points_exchange', true);
  perform set_config(
    'app.wallet_activity_description',
    format('Exchanged %s Gems for %s Points', v_gems_spent, v_points_received),
    true
  );

  update public.profiles
  set gems = coalesce(gems, 0) - v_gems_spent,
      points = coalesce(points, 0) + v_points_received
  where id = auth.uid()
  returning gems, points into new_gems_balance, new_points_balance;

  return query select v_gems_spent, v_points_received,
    new_gems_balance, new_points_balance;
end;
$$;

-- Keep the old argument list so deployed clients do not break, but always use
-- the price stored in the database. The client-supplied p_price is ignored.
create or replace function public.buy_cosmetic(
  p_user_id uuid,
  p_cosmetic_id uuid,
  p_price numeric default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.store_items;
  player public.profiles;
  v_price integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'You can only purchase cosmetics for your own account';
  end if;

  select * into item
  from public.store_items
  where id = p_cosmetic_id
    and is_active = true
    and category = 'digital'
  for update;
  if not found then
    raise exception 'This cosmetic is unavailable';
  end if;

  if exists (
    select 1 from public.user_inventory
    where user_id = auth.uid() and cosmetic_id = p_cosmetic_id
  ) then
    return true;
  end if;

  v_price := greatest(coalesce(item.price_points, 0), 0);
  if item.price_currency not in ('points', 'gems') then
    raise exception 'This item cannot be purchased with a wallet currency';
  end if;

  select * into player from public.profiles where id = auth.uid() for update;
  if item.price_currency = 'gems' and coalesce(player.gems, 0) < v_price then
    return false;
  end if;
  if item.price_currency = 'points' and coalesce(player.points, 0) < v_price then
    return false;
  end if;

  perform set_config('app.wallet_activity_type', 'cosmetic_purchase', true);
  perform set_config('app.wallet_activity_description', 'Purchased ' || item.name, true);
  update public.profiles
  set gems = coalesce(gems, 0) - case when item.price_currency = 'gems' then v_price else 0 end,
      points = coalesce(points, 0) - case when item.price_currency = 'points' then v_price else 0 end
  where id = auth.uid();

  insert into public.user_inventory(user_id, cosmetic_id, is_equipped)
  values (auth.uid(), p_cosmetic_id, false);
  return true;
end;
$$;

revoke all on function public.get_gem_exchange_config() from public;
revoke all on function public.exchange_gems_for_points(integer) from public;
revoke all on function public.buy_cosmetic(uuid, uuid, numeric) from public;
grant execute on function public.get_gem_exchange_config() to authenticated;
grant execute on function public.exchange_gems_for_points(integer) to authenticated;
grant execute on function public.buy_cosmetic(uuid, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
