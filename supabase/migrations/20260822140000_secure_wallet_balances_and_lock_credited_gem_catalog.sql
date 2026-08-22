-- Wallet values are economic state. Keep normal profile editing available, but
-- reject direct PostgREST updates to points or gems from player sessions.
-- SECURITY DEFINER reward, exchange, and purchase RPCs continue to run as the
-- function owner and therefore remain the only trusted write path.
create or replace function public.prevent_untrusted_wallet_balance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.points is distinct from old.points or new.gems is distinct from old.gems)
    and current_user in ('anon', 'authenticated')
    and not exists (
      select 1
      from public.profiles actor
      where actor.id = auth.uid()
        and actor.role in ('admin', 'super_admin')
    ) then
    raise exception 'Wallet balances can only be changed by a trusted server operation';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_untrusted_wallet_balance_updates on public.profiles;
create trigger profiles_prevent_untrusted_wallet_balance_updates
  before update of points, gems on public.profiles
  for each row execute function public.prevent_untrusted_wallet_balance_update();

-- Once a Gem pack has credited a real purchase, its fulfillment identity and
-- grant must not be silently changed. Descriptive/catalog presentation fields
-- such as name, image, and sort order can still be maintained by admins.
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
    and (
      new.sku is distinct from old.sku
      or new.gem_amount is distinct from old.gem_amount
      or new.bonus_gems is distinct from old.bonus_gems
      or new.apple_product_id is distinct from old.apple_product_id
      or new.google_product_id is distinct from old.google_product_id
    )
    and exists (
      select 1
      from public.store_purchase_transactions t
      where t.catalog_item_id = old.id
        and t.purchase_status = 'credited'
    ) then
    raise exception 'Gem pack SKU, storefront product IDs, and Gem grants cannot change after a verified purchase';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_untrusted_wallet_balance_update() from public, anon, authenticated;

notify pgrst, 'reload schema';
