-- Tournament scoring is isolated from normal-game rankings. Every tournament
-- match contributes only to this event's leaderboard.
alter table public.tournaments
  add column if not exists win_points integer not null default 3,
  add column if not exists draw_points integer not null default 1,
  add column if not exists loss_points integer not null default -1,
  add column if not exists current_round integer not null default 0;

alter table public.tournament_entries
  add column if not exists matches_played integer not null default 0,
  add column if not exists wins integer not null default 0,
  add column if not exists draws integer not null default 0,
  add column if not exists losses integer not null default 0;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null,
  game_name text not null,
  player_one_id uuid not null references public.profiles(id) on delete cascade,
  player_two_id uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  player_one_score integer not null default 0,
  player_two_score integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (player_one_id <> player_two_id),
  unique (tournament_id, round_number, player_one_id),
  unique (tournament_id, round_number, player_two_id)
);
create index if not exists tournament_matches_event_round_idx on public.tournament_matches(tournament_id, round_number, status);

alter table public.tournament_matches enable row level security;
drop policy if exists "players read tournament matches" on public.tournament_matches;
create policy "players read tournament matches" on public.tournament_matches for select to authenticated using (true);
drop policy if exists "admins manage tournament matches" on public.tournament_matches;
create policy "admins manage tournament matches" on public.tournament_matches for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

create or replace view public.tournament_leaderboard as
select
  e.tournament_id,
  e.user_id,
  e.score,
  e.matches_played,
  e.wins,
  e.draws,
  e.losses,
  dense_rank() over (
    partition by e.tournament_id
    order by e.score desc, e.wins desc, e.losses asc, e.matches_played desc, e.joined_at asc
  ) as rank
from public.tournament_entries e;

create or replace function public.create_tournament_round(target_tournament uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare
  event public.tournaments;
  next_round integer;
  selected_game text;
  created_count integer := 0;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then
    raise exception 'Admin access required';
  end if;
  select * into event from public.tournaments where id = target_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if event.status not in ('upcoming', 'active') then raise exception 'Tournament is not available for fixtures'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = target_tournament and status in ('scheduled', 'in_progress')) then
    raise exception 'Complete or cancel the current round before creating another';
  end if;

  next_round := event.current_round + 1;
  selected_game := coalesce(event.games[1 + mod(next_round - 1, greatest(cardinality(event.games), 1))], event.game_title);
  if selected_game is null or selected_game = '' then raise exception 'Add at least one tournament game first'; end if;

  with seeded as (
    select user_id, row_number() over (order by score desc, wins desc, losses asc, joined_at asc) as slot
    from public.tournament_entries where tournament_id = target_tournament and status = 'registered'
  ), pairs as (
    select a.user_id as player_one_id, b.user_id as player_two_id
    from seeded a join seeded b on b.slot = a.slot + 1
    where mod(a.slot, 2) = 1
  )
  insert into public.tournament_matches(tournament_id, round_number, game_name, player_one_id, player_two_id)
  select target_tournament, next_round, selected_game, player_one_id, player_two_id from pairs;
  get diagnostics created_count = row_count;
  if created_count = 0 then raise exception 'At least two registered players are required'; end if;
  update public.tournaments set current_round = next_round, status = 'active' where id = target_tournament;
  return created_count;
end;
$$;

create or replace function public.record_tournament_match_result(target_match uuid, result text, player_one_score_value integer default 0, player_two_score_value integer default 0)
returns public.tournament_matches language plpgsql security definer set search_path=public as $$
declare
  fixture public.tournament_matches;
  event public.tournaments;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then raise exception 'Admin access required'; end if;
  if result not in ('player_one', 'player_two', 'draw') then raise exception 'Result must be player_one, player_two, or draw'; end if;
  select * into fixture from public.tournament_matches where id = target_match for update;
  if not found then raise exception 'Fixture not found'; end if;
  if fixture.status = 'completed' then raise exception 'Fixture already completed'; end if;
  select * into event from public.tournaments where id = fixture.tournament_id;

  update public.tournament_matches set
    status = 'completed', completed_at = now(), player_one_score = player_one_score_value, player_two_score = player_two_score_value,
    winner_id = case when result = 'player_one' then fixture.player_one_id when result = 'player_two' then fixture.player_two_id else null end
  where id = target_match returning * into fixture;

  if result = 'draw' then
    update public.tournament_entries set score = score + event.draw_points, matches_played = matches_played + 1, draws = draws + 1
    where tournament_id = fixture.tournament_id and user_id in (fixture.player_one_id, fixture.player_two_id);
  else
    update public.tournament_entries set score = score + event.win_points, matches_played = matches_played + 1, wins = wins + 1
    where tournament_id = fixture.tournament_id and user_id = fixture.winner_id;
    update public.tournament_entries set score = score + event.loss_points, matches_played = matches_played + 1, losses = losses + 1
    where tournament_id = fixture.tournament_id and user_id = case when fixture.winner_id = fixture.player_one_id then fixture.player_two_id else fixture.player_one_id end;
  end if;
  return fixture;
end;
$$;

grant select on public.tournament_leaderboard to authenticated;
grant execute on function public.create_tournament_round(uuid) to authenticated;
grant execute on function public.record_tournament_match_result(uuid, text, integer, integer) to authenticated;

-- Lock final placements from the competition leaderboard before paying awards.
create or replace function public.complete_tournament(target_tournament uuid)
returns void language plpgsql security definer set search_path=public as $$
declare event public.tournaments; entrant public.tournament_entries; award public.tournament_awards;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then raise exception 'Admin access required'; end if;
  select * into event from public.tournaments where id = target_tournament for update;
  if not found or event.status = 'completed' then raise exception 'Tournament cannot be completed'; end if;

  with standings as (
    select id, dense_rank() over (order by score desc, wins desc, losses asc, matches_played desc, joined_at asc) as final_rank
    from public.tournament_entries where tournament_id = target_tournament
  ) update public.tournament_entries e set placement = standings.final_rank from standings where e.id = standings.id;

  for entrant in select * from public.tournament_entries where tournament_id = target_tournament loop
    select * into award from public.tournament_awards where tournament_id = target_tournament and placement = entrant.placement;
    perform set_config('app.wallet_activity_type', 'tournament_reward', true);
    perform set_config('app.wallet_activity_description', 'Tournament reward: ' || event.title || ' (rank ' || entrant.placement || ')', true);
    if coalesce(award.points, 0) + coalesce(event.participation_points, 0) > 0 then update public.profiles set points = coalesce(points, 0) + coalesce(award.points, 0) + coalesce(event.participation_points, 0) where id = entrant.user_id; end if;
    if coalesce(award.gems, 0) + coalesce(event.participation_gems, 0) > 0 then update public.profiles set gems = coalesce(gems, 0) + coalesce(award.gems, 0) + coalesce(event.participation_gems, 0) where id = entrant.user_id; end if;
    if event.participation_badge_id is not null then insert into public.user_badges(user_id, badge_id, source, source_id) values(entrant.user_id, event.participation_badge_id, 'tournament_participation', target_tournament) on conflict do nothing; end if;
    if award.badge_id is not null then insert into public.user_badges(user_id, badge_id, source, source_id) values(entrant.user_id, award.badge_id, 'tournament_placement', target_tournament) on conflict do nothing; end if;
    update public.tournament_entries set status = case when entrant.placement = 1 then 'winner' else 'participated' end, completed_at = now() where id = entrant.id;
  end loop;
  update public.tournaments set status = 'completed' where id = target_tournament;
end;
$$;
grant execute on function public.complete_tournament(uuid) to authenticated;
notify pgrst, 'reload schema';
