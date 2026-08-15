begin;
select plan(6);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_items' and column_name = 'status'
  ),
  'store_items has an explicit catalog status'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_items' and column_name = 'bonus_gems'
  ),
  'Gem packs support a separately recorded bonus grant'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'store_items_apple_product_id_unique'
  ) and exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'store_items_google_product_id_unique'
  ),
  'platform product IDs are uniquely indexed'
);

select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'credit_verified_gem_purchase'
      and p.prosecdef = true
  ),
  'verified Gem credit is implemented as a security-definer server function'
);

select ok(
  exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'store_purchase_transactions' and c.relrowsecurity
  ),
  'the purchase ledger has row-level security enabled'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.credit_verified_gem_purchase(uuid,text,text,text,text,text,text,text)',
    'execute'
  ),
  'authenticated players cannot execute the Gem-credit function'
);

select * from finish();
rollback;
