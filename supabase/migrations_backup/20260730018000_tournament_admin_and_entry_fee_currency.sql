-- Let authenticated admin accounts create and manage tournaments, and record
-- the currency used for an entry fee. Existing fees were Gems-only.
alter table public.tournaments
  add column if not exists entry_fee_currency text not null default 'gems'
  check (entry_fee_currency in ('points', 'gems'));

drop policy if exists "admins create tournaments" on public.tournaments;
create policy "admins create tournaments"
  on public.tournaments for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

drop policy if exists "admins update tournaments" on public.tournaments;
create policy "admins update tournaments"
  on public.tournaments for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

create or replace function public.register_for_tournament(target_tournament uuid)
returns public.tournament_entries language plpgsql security definer set search_path=public as $$
declare
  event public.tournaments;
  entrant public.profiles;
  entry public.tournament_entries;
begin
  select * into event from public.tournaments where id = target_tournament for update;
  if not found or event.status not in ('upcoming', 'active') then
    raise exception 'Tournament is not open for registration';
  end if;
  if coalesce(event.current_slots, 0) >= event.max_slots then
    raise exception 'Tournament is full';
  end if;

  select * into entrant from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Player profile not found'; end if;
  if event.entry_fee > 0 and event.entry_fee_currency = 'points' and coalesce(entrant.points, 0) < event.entry_fee then
    raise exception 'Not enough points for this tournament entry fee';
  end if;
  if event.entry_fee > 0 and event.entry_fee_currency = 'gems' and coalesce(entrant.gems, 0) < event.entry_fee then
    raise exception 'Not enough gems for this tournament entry fee';
  end if;

  insert into public.tournament_entries(tournament_id, user_id)
    values(target_tournament, auth.uid()) returning * into entry;

  if event.entry_fee > 0 then
    perform set_config('app.wallet_activity_type', 'tournament_entry_fee', true);
    perform set_config('app.wallet_activity_description', 'Tournament entry fee: ' || event.title, true);
    if event.entry_fee_currency = 'points' then
      update public.profiles set points = coalesce(points, 0) - event.entry_fee where id = auth.uid();
    else
      update public.profiles set gems = coalesce(gems, 0) - event.entry_fee where id = auth.uid();
    end if;
  end if;

  update public.tournaments set current_slots = coalesce(current_slots, 0) + 1 where id = target_tournament;
  return entry;
end;
$$;

grant execute on function public.register_for_tournament(uuid) to authenticated;
notify pgrst, 'reload schema';
