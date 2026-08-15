-- Production-ready Gem catalog. Existing store_items remain the single catalog
-- source of truth; category = 'currency' represents a real-money Gem pack.

alter table public.store_items
  add column if not exists gem_amount integer not null default 0,
  add column if not exists bonus_gems integer not null default 0,
  add column if not exists apple_product_id text,
  add column if not exists google_product_id text,
  add column if not exists status text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamp with time zone not null default timezone('utc', now());

-- Preserve the existing catalog's visibility when introducing explicit status.
update public.store_items
set status = case when is_active then 'active' else 'disabled' end
where status is null;

alter table public.store_items
  alter column status set default 'draft',
  alter column status set not null;

alter table public.store_items
  drop constraint if exists store_items_currency_gem_pack_check,
  drop constraint if exists store_items_status_check,
  drop constraint if exists store_items_gem_amount_nonnegative_check,
  drop constraint if exists store_items_bonus_gems_nonnegative_check,
  add constraint store_items_status_check
    check (status in ('draft', 'active', 'disabled')),
  add constraint store_items_gem_amount_nonnegative_check check (gem_amount >= 0),
  add constraint store_items_bonus_gems_nonnegative_check check (bonus_gems >= 0),
  add constraint store_items_currency_uses_usd_reference_price_check
    check (category <> 'currency' or price_currency = 'fiat_usd');

comment on column public.store_items.gem_amount is
  'Base Gems credited only after a verified Apple App Store or Google Play purchase.';
comment on column public.store_items.bonus_gems is
  'Optional promotional Gems added to the base Gem grant after verification.';
comment on column public.store_items.price_fiat is
  'Reference USD price for administration/display only. Storefront pricing is authoritative.';
comment on column public.store_items.status is
  'Catalog lifecycle: draft is internal, active is player-visible, disabled is archived from sale.';
comment on column public.store_items.apple_product_id is
  'Immutable after a verified purchase is recorded for this catalog item.';
comment on column public.store_items.google_product_id is
  'Immutable after a verified purchase is recorded for this catalog item.';

create unique index if not exists store_items_apple_product_id_unique
  on public.store_items (apple_product_id)
  where apple_product_id is not null;

create unique index if not exists store_items_google_product_id_unique
  on public.store_items (google_product_id)
  where google_product_id is not null;

-- Only active catalog records may be read by player clients. Admins retain the
-- existing full-access policy.
drop policy if exists "Allow public read access for active items" on public.store_items;
create policy "Allow public read access for active catalog items" on public.store_items
  for select to anon, authenticated
  using (is_active = true and status = 'active');

-- Audit is written to the existing system-wide audit log. It records meaningful
-- catalog changes without exposing store credentials or raw purchase proofs.
create or replace function public.audit_store_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_state jsonb;
  after_state jsonb;
begin
  before_state := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'name', old.name, 'sku', old.sku, 'status', old.status,
    'gem_amount', old.gem_amount, 'bonus_gems', old.bonus_gems,
    'apple_product_id', old.apple_product_id, 'google_product_id', old.google_product_id,
    'price_fiat', old.price_fiat, 'sort_order', old.sort_order
  ) end;
  after_state := case when tg_op = 'DELETE' then null else jsonb_build_object(
    'name', new.name, 'sku', new.sku, 'status', new.status,
    'gem_amount', new.gem_amount, 'bonus_gems', new.bonus_gems,
    'apple_product_id', new.apple_product_id, 'google_product_id', new.google_product_id,
    'price_fiat', new.price_fiat, 'sort_order', new.sort_order
  ) end;

  insert into public.system_audit_logs(actor_id, action_token, target_id, payload)
  values (
    auth.uid(),
    'store_catalog_' || lower(tg_op),
    coalesce(new.id, old.id)::text,
    jsonb_strip_nulls(jsonb_build_object('before', before_state, 'after', after_state))
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_store_item_catalog_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());

  if new.category = 'currency' then
    new.price_currency := 'fiat_usd';
    new.price_points := 0;
    -- is_active is retained for backwards compatibility, but status is the
    -- canonical lifecycle value for new catalog behaviour.
    new.is_active := new.status = 'active';

    if new.status = 'active' then
      if new.gem_amount <= 0 then
        raise exception 'Active Gem packs must grant at least one Gem';
      end if;
      if coalesce(new.price_fiat, 0) <= 0 then
        raise exception 'Active Gem packs must have a positive reference USD price';
      end if;
      if nullif(btrim(new.apple_product_id), '') is null
         and nullif(btrim(new.google_product_id), '') is null then
        raise exception 'Active Gem packs require an Apple App Store or Google Play product ID';
      end if;
    end if;
  else
    new.gem_amount := 0;
    new.bonus_gems := 0;
    new.apple_product_id := null;
    new.google_product_id := null;
    new.is_active := new.status = 'active';
  end if;

  if tg_op = 'UPDATE'
    and (new.apple_product_id is distinct from old.apple_product_id
      or new.google_product_id is distinct from old.google_product_id)
    and exists (
      select 1 from public.store_purchase_transactions t
      where t.catalog_item_id = old.id and t.purchase_status = 'credited'
    ) then
    raise exception 'Store product IDs cannot be changed after a verified purchase';
  end if;

  return new;
end;
$$;

-- A purchase ledger is intentionally separate from the catalog: it preserves
-- the exact grant and transaction identity needed for reconciliation.
create table if not exists public.store_purchase_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default timezone('utc', now()),
  credited_at timestamp with time zone,
  user_id uuid not null references public.profiles(id) on delete restrict,
  catalog_item_id uuid not null references public.store_items(id) on delete restrict,
  platform text not null check (platform in ('apple', 'google')),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  store_product_id text not null,
  store_transaction_id text not null,
  original_transaction_id text,
  purchase_token_hash text,
  base_gems integer not null check (base_gems > 0),
  bonus_gems integer not null default 0 check (bonus_gems >= 0),
  credited_gems integer not null check (credited_gems > 0),
  verification_status text not null default 'verified' check (verification_status in ('verified', 'rejected')),
  purchase_status text not null default 'credited' check (purchase_status in ('credited', 'rejected')),
  verifier_reference text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists store_purchase_transactions_platform_transaction_key
  on public.store_purchase_transactions(platform, store_transaction_id);
create unique index if not exists store_purchase_transactions_platform_token_hash_key
  on public.store_purchase_transactions(platform, purchase_token_hash)
  where purchase_token_hash is not null;
create index if not exists store_purchase_transactions_user_created_idx
  on public.store_purchase_transactions(user_id, created_at desc);
create index if not exists store_purchase_transactions_catalog_item_idx
  on public.store_purchase_transactions(catalog_item_id);
create index if not exists store_items_active_catalog_sort_idx
  on public.store_items(status, sort_order, created_at desc)
  where is_active = true;

alter table public.store_purchase_transactions enable row level security;
create policy "admins read store purchase ledger" on public.store_purchase_transactions
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  ));

drop trigger if exists store_items_catalog_rules on public.store_items;
create trigger store_items_catalog_rules
  before insert or update on public.store_items
  for each row execute function public.enforce_store_item_catalog_rules();

drop trigger if exists store_items_catalog_audit on public.store_items;
create trigger store_items_catalog_audit
  after insert or update or delete on public.store_items
  for each row execute function public.audit_store_item_change();

-- Server-only, atomic and idempotent grant path. It deliberately accepts no
-- client call: a future receipt/JWS verifier must call it with the service-role
-- key only after Apple or Google verifies the purchase independently.
create or replace function public.credit_verified_gem_purchase(
  p_user_id uuid,
  p_platform text,
  p_store_product_id text,
  p_store_transaction_id text,
  p_purchase_token_hash text default null,
  p_original_transaction_id text default null,
  p_environment text default 'production',
  p_verifier_reference text default null
)
returns table(
  purchase_id uuid,
  already_credited boolean,
  gems_credited integer,
  new_gems_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.store_items;
  prior public.store_purchase_transactions;
  created_purchase public.store_purchase_transactions;
  player public.profiles;
  v_total_gems integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the verified purchase service may credit Gems';
  end if;
  if p_platform not in ('apple', 'google') then
    raise exception 'Unsupported purchase platform';
  end if;
  if nullif(btrim(p_store_product_id), '') is null
    or nullif(btrim(p_store_transaction_id), '') is null then
    raise exception 'A store product ID and transaction ID are required';
  end if;

  select * into prior from public.store_purchase_transactions
  where platform = p_platform
    and (store_transaction_id = p_store_transaction_id
      or (p_purchase_token_hash is not null and purchase_token_hash = p_purchase_token_hash));
  if found then
    if prior.user_id <> p_user_id or prior.store_product_id <> p_store_product_id then
      raise exception 'Purchase identity does not match the original credit';
    end if;
    select * into player from public.profiles where id = p_user_id;
    return query select prior.id, true, prior.credited_gems, coalesce(player.gems, 0);
    return;
  end if;

  select * into item from public.store_items
  where category = 'currency'
    and status = 'active'
    and is_active = true
    and ((p_platform = 'apple' and apple_product_id = p_store_product_id)
      or (p_platform = 'google' and google_product_id = p_store_product_id))
  for update;
  if not found then
    raise exception 'No active Gem pack matches this verified storefront product';
  end if;

  v_total_gems := item.gem_amount + item.bonus_gems;
  insert into public.store_purchase_transactions (
    user_id, catalog_item_id, platform, environment, store_product_id,
    store_transaction_id, original_transaction_id, purchase_token_hash,
    base_gems, bonus_gems, credited_gems, verification_status,
    purchase_status, credited_at, verifier_reference
  ) values (
    p_user_id, item.id, p_platform, p_environment, p_store_product_id,
    p_store_transaction_id, p_original_transaction_id, p_purchase_token_hash,
    item.gem_amount, item.bonus_gems, v_total_gems, 'verified',
    'credited', timezone('utc', now()), p_verifier_reference
  )
  on conflict (platform, store_transaction_id) do nothing
  returning * into created_purchase;

  if created_purchase.id is null then
    select * into prior from public.store_purchase_transactions
    where platform = p_platform
      and (store_transaction_id = p_store_transaction_id
        or (p_purchase_token_hash is not null and purchase_token_hash = p_purchase_token_hash));
    if prior.user_id <> p_user_id or prior.store_product_id <> p_store_product_id then
      raise exception 'Purchase identity does not match the original credit';
    end if;
    select * into player from public.profiles where id = p_user_id;
    return query select prior.id, true, prior.credited_gems, coalesce(player.gems, 0);
    return;
  end if;

  select * into player from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  perform set_config('app.wallet_activity_type', 'verified_gem_purchase', true);
  perform set_config('app.wallet_activity_description',
    format('Verified %s Gem purchase: %s', v_total_gems, item.name), true);
  update public.profiles
  set gems = coalesce(gems, 0) + v_total_gems
  where id = p_user_id
  returning gems into new_gems_balance;

  return query select created_purchase.id, false, v_total_gems, new_gems_balance;
end;
$$;

revoke all on table public.store_purchase_transactions from public, anon, authenticated;
revoke all on function public.credit_verified_gem_purchase(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_verified_gem_purchase(uuid, text, text, text, text, text, text, text) to service_role;

-- Administrator-ready starter catalog. Draft items never appear in the player
-- store until the matching storefront products are ready and the pack is set active.
insert into public.store_items (
  name, description, sku, category, price_points, price_fiat, price_currency,
  gem_amount, bonus_gems, apple_product_id, google_product_id, stock_quantity,
  image_url, is_active, status, sort_order
)
values
  ('Starter Pack — 100 Gems', '100 Gems to exchange for gameplay Points.', 'GEM_PACK_100', 'currency', 0, 0.99, 'fiat_usd', 100, 0, 'com.joeyoke.app.gems100', 'gems_100', -1, 'https://img.icons8.com/color/96/gemstone.png', false, 'draft', 10),
  ('500 Gems', '500 Gems to exchange for gameplay Points.', 'GEM_PACK_500', 'currency', 0, 4.99, 'fiat_usd', 500, 0, null, null, -1, 'https://img.icons8.com/color/96/gemstone.png', false, 'draft', 20),
  ('1,000 Gems', '1,000 Gems to exchange for gameplay Points.', 'GEM_PACK_1000', 'currency', 0, 9.99, 'fiat_usd', 1000, 0, null, null, -1, 'https://img.icons8.com/color/96/gemstone.png', false, 'draft', 30),
  ('2,500 Gems', '2,500 Gems to exchange for gameplay Points.', 'GEM_PACK_2500', 'currency', 0, 19.99, 'fiat_usd', 2500, 0, null, null, -1, 'https://img.icons8.com/color/96/gemstone.png', false, 'draft', 40),
  ('6,500 Gems', '6,500 Gems to exchange for gameplay Points.', 'GEM_PACK_6500', 'currency', 0, 49.99, 'fiat_usd', 6500, 0, null, null, -1, 'https://img.icons8.com/color/96/gemstone.png', false, 'draft', 50)
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  price_fiat = excluded.price_fiat,
  gem_amount = excluded.gem_amount,
  bonus_gems = excluded.bonus_gems,
  apple_product_id = coalesce(public.store_items.apple_product_id, excluded.apple_product_id),
  google_product_id = coalesce(public.store_items.google_product_id, excluded.google_product_id),
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

alter table public.platform_config
  add column if not exists gem_exchange_gem_cost integer not null default 1,
  add column if not exists gem_exchange_points_reward integer not null default 100;

alter table public.platform_config
  drop constraint if exists platform_config_gem_exchange_gem_cost_check,
  add constraint platform_config_gem_exchange_gem_cost_check check (gem_exchange_gem_cost > 0),
  drop constraint if exists platform_config_gem_exchange_points_reward_check,
  add constraint platform_config_gem_exchange_points_reward_check check (gem_exchange_points_reward > 0);

create or replace function public.get_gem_exchange_config()
returns table(gem_cost integer, points_reward integer)
language sql security definer set search_path = public
as $$
  select gem_exchange_gem_cost, gem_exchange_points_reward
  from public.platform_config where id = 1;
$$;

-- Atomic, server-authoritative Gem-to-Points conversion.
create or replace function public.exchange_gems_for_points(p_quantity integer default 1)
returns table(gems_spent integer, points_received integer, new_gems_balance integer, new_points_balance integer)
language plpgsql security definer set search_path = public
as $$
declare
  cfg public.platform_config;
  player public.profiles;
  v_gems_spent integer;
  v_points_received integer;
begin
  if auth.uid() is null then raise exception 'Sign in to exchange Gems'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Exchange quantity must be between 1 and 100';
  end if;
  select * into cfg from public.platform_config where id = 1;
  if not found then raise exception 'Gem exchange settings are unavailable'; end if;
  select * into player from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  v_gems_spent := cfg.gem_exchange_gem_cost * p_quantity;
  v_points_received := cfg.gem_exchange_points_reward * p_quantity;
  if coalesce(player.gems, 0) < v_gems_spent then raise exception 'Not enough Gems for this exchange'; end if;
  perform set_config('app.wallet_activity_type', 'gem_to_points_exchange', true);
  perform set_config('app.wallet_activity_description', format('Exchanged %s Gems for %s Points', v_gems_spent, v_points_received), true);
  update public.profiles
  set gems = coalesce(gems, 0) - v_gems_spent,
      points = coalesce(points, 0) + v_points_received
  where id = auth.uid()
  returning gems, points into new_gems_balance, new_points_balance;
  return query select v_gems_spent, v_points_received, new_gems_balance, new_points_balance;
end;
$$;

-- Retain the public signature for existing cosmetic clients, but never trust a
-- client-supplied price.
create or replace function public.buy_cosmetic(p_user_id uuid, p_cosmetic_id uuid, p_price numeric default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare item public.store_items; player public.profiles; v_price integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'You can only purchase cosmetics for your own account'; end if;
  select * into item from public.store_items where id = p_cosmetic_id and is_active = true and status = 'active' and category = 'digital' for update;
  if not found then raise exception 'This cosmetic is unavailable'; end if;
  if exists (select 1 from public.user_inventory where user_id = auth.uid() and cosmetic_id = p_cosmetic_id) then return true; end if;
  v_price := greatest(coalesce(item.price_points, 0), 0);
  if item.price_currency not in ('points', 'gems') then raise exception 'This item cannot be purchased with a wallet currency'; end if;
  select * into player from public.profiles where id = auth.uid() for update;
  if item.price_currency = 'gems' and coalesce(player.gems, 0) < v_price then return false; end if;
  if item.price_currency = 'points' and coalesce(player.points, 0) < v_price then return false; end if;
  perform set_config('app.wallet_activity_type', 'cosmetic_purchase', true);
  perform set_config('app.wallet_activity_description', 'Purchased ' || item.name, true);
  update public.profiles set
    gems = coalesce(gems, 0) - case when item.price_currency = 'gems' then v_price else 0 end,
    points = coalesce(points, 0) - case when item.price_currency = 'points' then v_price else 0 end
  where id = auth.uid();
  insert into public.user_inventory(user_id, cosmetic_id, is_equipped) values (auth.uid(), p_cosmetic_id, false);
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
