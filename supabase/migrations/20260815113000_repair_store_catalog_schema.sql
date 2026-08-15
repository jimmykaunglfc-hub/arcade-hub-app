-- Corrective migration for projects where 20260815100000 was recorded in the
-- migration history without its Store Catalog DDL being present. This file is
-- deliberately additive and idempotent: it does not rewrite past migrations,
-- remove/rename columns, or alter existing store records beyond filling a
-- missing catalog status from the existing is_active value.

alter table public.store_items
  add column if not exists price_points integer not null default 0,
  add column if not exists price_currency text not null default 'points',
  add column if not exists price_fiat numeric,
  add column if not exists gem_amount integer not null default 0,
  add column if not exists bonus_gems integer not null default 0,
  add column if not exists apple_product_id text,
  add column if not exists google_product_id text,
  add column if not exists status text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamp with time zone not null default timezone('utc', now());

-- Preserve all existing store visibility when status is introduced.
update public.store_items
set status = case when is_active then 'active' else 'disabled' end
where status is null;

alter table public.store_items
  alter column status set default 'draft',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_items'::regclass
      and conname = 'store_items_status_check'
  ) then
    alter table public.store_items add constraint store_items_status_check
      check (status in ('draft', 'active', 'disabled')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_items'::regclass
      and conname = 'store_items_gem_amount_nonnegative_check'
  ) then
    alter table public.store_items add constraint store_items_gem_amount_nonnegative_check
      check (gem_amount >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_items'::regclass
      and conname = 'store_items_bonus_gems_nonnegative_check'
  ) then
    alter table public.store_items add constraint store_items_bonus_gems_nonnegative_check
      check (bonus_gems >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_items'::regclass
      and conname = 'store_items_currency_uses_usd_reference_price_check'
  ) then
    alter table public.store_items add constraint store_items_currency_uses_usd_reference_price_check
      check (category <> 'currency' or price_currency = 'fiat_usd') not valid;
  end if;
end;
$$;

comment on column public.store_items.gem_amount is
  'Base Gems credited only after a verified Apple App Store or Google Play purchase.';
comment on column public.store_items.bonus_gems is
  'Optional promotional Gems added to the base Gem grant after verification.';
comment on column public.store_items.price_fiat is
  'Reference USD price for administration/display only. Storefront pricing is authoritative.';
comment on column public.store_items.status is
  'Catalog lifecycle: draft is internal, active is player-visible, disabled is archived from sale.';
comment on column public.store_items.apple_product_id is
  'Apple App Store consumable product identifier. Immutable after a verified purchase.';
comment on column public.store_items.google_product_id is
  'Google Play one-time product identifier. Immutable after a verified purchase.';

create unique index if not exists store_items_apple_product_id_unique
  on public.store_items (apple_product_id)
  where apple_product_id is not null;

create unique index if not exists store_items_google_product_id_unique
  on public.store_items (google_product_id)
  where google_product_id is not null;

create index if not exists store_items_active_catalog_sort_idx
  on public.store_items(status, sort_order, created_at desc)
  where is_active = true;

-- Keep the old active-only policy from leaking Draft/Disabled catalog rows.
drop policy if exists "Allow public read access for active items" on public.store_items;
drop policy if exists "Allow public read access for active catalog items" on public.store_items;
create policy "Allow public read access for active catalog items" on public.store_items
  for select to anon, authenticated
  using (is_active = true and status = 'active');

-- The ledger records only verified purchase outcomes. It never stores raw
-- receipts or raw Google purchase tokens.
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

-- If a partially created ledger table already exists, complete the columns
-- expected by the idempotent credit function without dropping any data.
alter table public.store_purchase_transactions
  add column if not exists credited_at timestamp with time zone,
  add column if not exists original_transaction_id text,
  add column if not exists purchase_token_hash text,
  add column if not exists bonus_gems integer not null default 0,
  add column if not exists verifier_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists store_purchase_transactions_platform_transaction_key
  on public.store_purchase_transactions(platform, store_transaction_id);
create unique index if not exists store_purchase_transactions_platform_token_hash_key
  on public.store_purchase_transactions(platform, purchase_token_hash)
  where purchase_token_hash is not null;
create index if not exists store_purchase_transactions_user_created_idx
  on public.store_purchase_transactions(user_id, created_at desc);
create index if not exists store_purchase_transactions_catalog_item_idx
  on public.store_purchase_transactions(catalog_item_id);

alter table public.store_purchase_transactions enable row level security;
drop policy if exists "admins read store purchase ledger" on public.store_purchase_transactions;
create policy "admins read store purchase ledger" on public.store_purchase_transactions
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  ));

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
    auth.uid(), 'store_catalog_' || lower(tg_op), coalesce(new.id, old.id)::text,
    jsonb_strip_nulls(jsonb_build_object('before', before_state, 'after', after_state))
  );
  if tg_op = 'DELETE' then return old; end if;
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
    new.is_active := new.status = 'active';
    if new.status = 'active' then
      if new.gem_amount <= 0 then raise exception 'Active Gem packs must grant at least one Gem'; end if;
      if coalesce(new.price_fiat, 0) <= 0 then raise exception 'Active Gem packs must have a positive reference USD price'; end if;
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

drop trigger if exists store_items_catalog_rules on public.store_items;
create trigger store_items_catalog_rules
  before insert or update on public.store_items
  for each row execute function public.enforce_store_item_catalog_rules();

drop trigger if exists store_items_catalog_audit on public.store_items;
create trigger store_items_catalog_audit
  after insert or update or delete on public.store_items
  for each row execute function public.audit_store_item_change();

-- This is deliberately callable by the service role only. A future Apple/Google
-- verifier must validate the real transaction first, then call this function.
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
returns table(purchase_id uuid, already_credited boolean, gems_credited integer, new_gems_balance integer)
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
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the verified purchase service may credit Gems'; end if;
  if p_platform not in ('apple', 'google') then raise exception 'Unsupported purchase platform'; end if;
  if nullif(btrim(p_store_product_id), '') is null or nullif(btrim(p_store_transaction_id), '') is null then
    raise exception 'A store product ID and transaction ID are required';
  end if;
  select * into prior from public.store_purchase_transactions
  where platform = p_platform and (
    store_transaction_id = p_store_transaction_id
    or (p_purchase_token_hash is not null and purchase_token_hash = p_purchase_token_hash)
  );
  if found then
    if prior.user_id <> p_user_id or prior.store_product_id <> p_store_product_id then raise exception 'Purchase identity does not match the original credit'; end if;
    select * into player from public.profiles where id = p_user_id;
    return query select prior.id, true, prior.credited_gems, coalesce(player.gems, 0);
    return;
  end if;
  select * into item from public.store_items
  where category = 'currency' and status = 'active' and is_active = true
    and ((p_platform = 'apple' and apple_product_id = p_store_product_id)
      or (p_platform = 'google' and google_product_id = p_store_product_id))
  for update;
  if not found then raise exception 'No active Gem pack matches this verified storefront product'; end if;
  v_total_gems := item.gem_amount + item.bonus_gems;
  insert into public.store_purchase_transactions (
    user_id, catalog_item_id, platform, environment, store_product_id,
    store_transaction_id, original_transaction_id, purchase_token_hash,
    base_gems, bonus_gems, credited_gems, verification_status,
    purchase_status, credited_at, verifier_reference
  ) values (
    p_user_id, item.id, p_platform, p_environment, p_store_product_id,
    p_store_transaction_id, p_original_transaction_id, p_purchase_token_hash,
    item.gem_amount, item.bonus_gems, v_total_gems, 'verified', 'credited',
    timezone('utc', now()), p_verifier_reference
  ) on conflict (platform, store_transaction_id) do nothing
  returning * into created_purchase;
  if created_purchase.id is null then
    select * into prior from public.store_purchase_transactions
    where platform = p_platform and (
      store_transaction_id = p_store_transaction_id
      or (p_purchase_token_hash is not null and purchase_token_hash = p_purchase_token_hash)
    );
    if prior.user_id <> p_user_id or prior.store_product_id <> p_store_product_id then raise exception 'Purchase identity does not match the original credit'; end if;
    select * into player from public.profiles where id = p_user_id;
    return query select prior.id, true, prior.credited_gems, coalesce(player.gems, 0);
    return;
  end if;
  select * into player from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  perform set_config('app.wallet_activity_type', 'verified_gem_purchase', true);
  perform set_config('app.wallet_activity_description', format('Verified %s Gem purchase: %s', v_total_gems, item.name), true);
  update public.profiles set gems = coalesce(gems, 0) + v_total_gems
  where id = p_user_id returning gems into new_gems_balance;
  return query select created_purchase.id, false, v_total_gems, new_gems_balance;
end;
$$;

revoke all on table public.store_purchase_transactions from public, anon, authenticated;
revoke all on function public.credit_verified_gem_purchase(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_verified_gem_purchase(uuid, text, text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
