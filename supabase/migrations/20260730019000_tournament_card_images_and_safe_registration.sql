alter table public.tournaments add column if not exists card_image_url text;

insert into storage.buckets (id, name, public)
values ('tournament-cards', 'tournament-cards', true)
on conflict (id) do update set public = true;

drop policy if exists "public reads tournament cards" on storage.objects;
create policy "public reads tournament cards" on storage.objects for select using (bucket_id = 'tournament-cards');
drop policy if exists "admins upload tournament cards" on storage.objects;
create policy "admins upload tournament cards" on storage.objects for insert to authenticated with check (bucket_id = 'tournament-cards' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
drop policy if exists "admins update tournament cards" on storage.objects;
create policy "admins update tournament cards" on storage.objects for update to authenticated using (bucket_id = 'tournament-cards' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check (bucket_id = 'tournament-cards' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

-- Some early installations stored entry_fee as text. Convert it safely before
-- comparing or charging it so registration never raises text > integer.
create or replace function public.register_for_tournament(target_tournament uuid)
returns public.tournament_entries language plpgsql security definer set search_path=public as $$
declare
  event public.tournaments;
  entrant public.profiles;
  entry public.tournament_entries;
  entry_fee_amount numeric := 0;
begin
  select * into event from public.tournaments where id = target_tournament for update;
  if not found or event.status not in ('upcoming', 'active') then raise exception 'Tournament is not open for registration'; end if;
  if coalesce(event.current_slots, 0) >= event.max_slots then raise exception 'Tournament is full'; end if;
  if coalesce(event.entry_fee::text, '') ~ '^[0-9]+([.][0-9]+)?$' then entry_fee_amount := event.entry_fee::text::numeric; end if;

  select * into entrant from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Player profile not found'; end if;
  if entry_fee_amount > 0 and event.entry_fee_currency = 'points' and coalesce(entrant.points, 0) < entry_fee_amount then raise exception 'Not enough points for this tournament entry fee'; end if;
  if entry_fee_amount > 0 and event.entry_fee_currency = 'gems' and coalesce(entrant.gems, 0) < entry_fee_amount then raise exception 'Not enough gems for this tournament entry fee'; end if;

  insert into public.tournament_entries(tournament_id, user_id) values(target_tournament, auth.uid()) returning * into entry;
  if entry_fee_amount > 0 then
    perform set_config('app.wallet_activity_type', 'tournament_entry_fee', true);
    perform set_config('app.wallet_activity_description', 'Tournament entry fee: ' || event.title, true);
    if event.entry_fee_currency = 'points' then update public.profiles set points = coalesce(points, 0) - entry_fee_amount where id = auth.uid();
    else update public.profiles set gems = coalesce(gems, 0) - entry_fee_amount where id = auth.uid(); end if;
  end if;
  update public.tournaments set current_slots = coalesce(current_slots, 0) + 1 where id = target_tournament;
  return entry;
end;
$$;
grant execute on function public.register_for_tournament(uuid) to authenticated;
notify pgrst, 'reload schema';
