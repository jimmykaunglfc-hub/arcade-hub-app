-- Production tournaments use game_title/max_slots/current_slots. Preserve those
-- columns and add a multi-game roster without referring to non-existent fields.
alter table public.tournaments add column if not exists games text[] not null default '{}';
update public.tournaments set games = array[game_title] where cardinality(games) = 0 and game_title is not null and game_title <> '';
alter table public.tournament_entries add column if not exists game_results jsonb not null default '{}'::jsonb;

create or replace function public.register_for_tournament(target_tournament uuid)
returns public.tournament_entries language plpgsql security definer set search_path=public as $$
declare event public.tournaments; entry public.tournament_entries;
begin
  select * into event from public.tournaments where id=target_tournament for update;
  if not found or event.status not in ('upcoming','active') then raise exception 'Tournament is not open for registration'; end if;
  if coalesce(event.current_slots,0) >= event.max_slots then raise exception 'Tournament is full'; end if;
  insert into public.tournament_entries(tournament_id,user_id) values(target_tournament,auth.uid()) returning * into entry;
  update public.tournaments set current_slots=coalesce(current_slots,0)+1 where id=target_tournament;
  return entry;
end; $$;
grant execute on function public.register_for_tournament(uuid) to authenticated;
