begin;
select plan(5);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_prevent_untrusted_wallet_balance_updates'
      and not tgisinternal
  ),
  'profiles has a wallet-balance protection trigger'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prevent_untrusted_wallet_balance_update'
      and not p.prosecdef
  ),
  'wallet-balance protection evaluates the initiating database role'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.prevent_untrusted_wallet_balance_update()',
    'execute'
  ),
  'players cannot invoke the wallet trigger function directly'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'credit_verified_gem_purchase'
      and p.prosecdef
  ) and not has_function_privilege(
    'authenticated',
    'public.credit_verified_gem_purchase(uuid,text,text,text,text,text,text,text)',
    'execute'
  ),
  'verified Gem credit remains server-only'
);

select ok(
  pg_get_functiondef('public.enforce_store_item_catalog_rules()'::regprocedure)
    like '%Gem pack SKU, storefront product IDs, and Gem grants cannot change after a verified purchase%',
  'credited Gem pack identifiers and grants are locked'
);

select * from finish();
rollback;
