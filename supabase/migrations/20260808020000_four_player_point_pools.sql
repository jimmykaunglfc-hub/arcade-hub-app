-- Authoritative winner-takes-all point pools for Big Two and Ludo.
-- Monopoly already has an equivalent room escrow and is routed through that
-- existing implementation by `fund_four_player_room` below.

create table if not exists public.four_player_match_escrow (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_points integer not null check (entry_points >= 0),
  status text not null default 'held' check (status in ('held', 'settled', 'refunded')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists four_player_match_escrow_held_idx
  on public.four_player_match_escrow(room_id)
  where status = 'held';

alter table public.four_player_match_escrow enable row level security;
drop policy if exists "four player members read own escrow" on public.four_player_match_escrow;
create policy "four player members read own escrow"
  on public.four_player_match_escrow
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.fund_four_player_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_is_member boolean;
  v_is_bot boolean;
  v_entry_fee integer;
  v_points integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to enter this match';
  end if;

  select r.game_key, p.is_bot
  into v_game_key, v_is_bot
  from public.matchmaking_rooms r
  join public.matchmaking_room_players p on p.room_id = r.id
  where r.id = p_room_id
    and p.user_id = auth.uid()
    and p.left_at is null
  for update of r, p;

  v_is_member := found;
  if not v_is_member or coalesce(v_is_bot, false) then
    raise exception 'Only a human player in this room can fund it';
  end if;

  if v_game_key = 'monopoly' then
    return public.fund_monopoly_room(p_room_id);
  end if;
  if v_game_key not in ('big-two', 'ludo') then
    raise exception 'This is not a supported four-player room';
  end if;

  if exists (
    select 1 from public.four_player_match_escrow
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    return jsonb_build_object('funded', true, 'already_funded', true);
  end if;

  select coalesce(g.entry_fee, 0)::integer
  into v_entry_fee
  from public.games g
  where lower(g.title) = case v_game_key
    when 'big-two' then 'big two'
    else v_game_key
  end
  limit 1;
  v_entry_fee := greatest(coalesce(v_entry_fee, 0), 0);

  select coalesce(points, 0)
  into v_points
  from public.profiles
  where id = auth.uid()
  for update;
  if v_points < v_entry_fee then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.profiles
  set points = coalesce(points, 0) - v_entry_fee
  where id = auth.uid();

  insert into public.four_player_match_escrow(room_id, user_id, entry_points)
  values (p_room_id, auth.uid(), v_entry_fee);

  return jsonb_build_object('funded', true, 'entry_points', v_entry_fee);
end;
$$;

-- A room can move from the lobby into play only after every participating
-- human has paid the entry cost. Timed bot seats are intentionally excluded.
create or replace function public.set_matchmaking_seat_ready(
  p_room_id uuid,
  p_ready boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_humans integer;
  v_unready integer;
  v_total integer;
  v_unfunded integer;
begin
  update public.matchmaking_room_players
  set ready = p_ready, connected_at = now(), last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  select game_key into v_game_key
  from public.matchmaking_rooms
  where id = p_room_id
  for update;
  if v_game_key is null then raise exception 'Matchmaking room not found'; end if;

  select count(*) filter (where not is_bot),
         count(*) filter (where not ready),
         count(*)
  into v_humans, v_unready, v_total
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;

  if v_game_key = 'monopoly' then
    select count(*) into v_unfunded
    from public.matchmaking_room_players p
    where p.room_id = p_room_id and p.left_at is null and not p.is_bot
      and not exists (
        select 1 from public.monopoly_match_escrow e
        where e.room_id = p_room_id and e.user_id = p.user_id and e.status = 'held'
      );
  elsif v_game_key in ('big-two', 'ludo') then
    select count(*) into v_unfunded
    from public.matchmaking_room_players p
    where p.room_id = p_room_id and p.left_at is null and not p.is_bot
      and not exists (
        select 1 from public.four_player_match_escrow e
        where e.room_id = p_room_id and e.user_id = p.user_id and e.status = 'held'
      );
  else
    v_unfunded := 0;
  end if;

  if v_total = 4 and v_unready = 0 and v_unfunded = 0 then
    update public.matchmaking_rooms
    set status = 'starting'
    where id = p_room_id and status = 'waiting';
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'human_players', v_humans,
    'all_ready', v_unready = 0,
    'all_funded', v_unfunded = 0
  );
end;
$$;

-- Joining a private room only reserves a seat. Funding and readiness above are
-- the one authoritative route that may begin a paid game.
create or replace function public.join_four_player_host_room(
  p_room_id uuid,
  p_name text,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.matchmaking_rooms;
  v_seat smallint;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join a room'; end if;
  select * into v_room
  from public.matchmaking_rooms
  where id = p_room_id and max_players = 4
  for update;
  if v_room.id is null or v_room.game_key not in ('monopoly', 'big-two', 'ludo') then
    raise exception 'Four-player room not found';
  end if;
  if v_room.status <> 'waiting' then raise exception 'This room is no longer open'; end if;

  select seat into v_seat
  from public.matchmaking_room_players
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  if v_seat is null then
    select min(s)::smallint into v_seat
    from generate_series(1, 4) as s
    where not exists (
      select 1 from public.matchmaking_room_players p
      where p.room_id = p_room_id and p.seat = s and p.left_at is null
    );
    if v_seat is null then raise exception 'This room is full'; end if;
    insert into public.matchmaking_room_players(room_id, user_id, seat, display_name, avatar_url, ready)
    values (p_room_id, auth.uid(), v_seat, coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, false);
  else
    update public.matchmaking_room_players
    set ready = false, connected_at = now(), last_seen_at = now(),
        display_name = coalesce(nullif(trim(p_name), ''), display_name),
        avatar_url = coalesce(p_avatar_url, avatar_url)
    where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  end if;

  select count(*) into v_count
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;
  return jsonb_build_object('room_id', p_room_id, 'room_code', v_room.room_code,
    'game_key', v_room.game_key, 'seat', v_seat, 'ready_players', v_count);
end;
$$;

create or replace function public.settle_four_player_room(
  p_room_id uuid,
  p_winner_seat smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_winner_id uuid;
  v_winner_is_bot boolean;
  v_total integer;
  v_duration integer;
begin
  select game_key,
         greatest(0, extract(epoch from now() - created_at)::integer)
  into v_game_key, v_duration
  from public.matchmaking_rooms
  where id = p_room_id
  for update;
  if v_game_key not in ('big-two', 'ludo') then
    raise exception 'This is not a supported four-player room';
  end if;

  select user_id, is_bot
  into v_winner_id, v_winner_is_bot
  from public.matchmaking_room_players
  where room_id = p_room_id and seat = p_winner_seat and left_at is null;
  if not found then raise exception 'Winning seat is not in this room'; end if;

  select coalesce(sum(entry_points), 0)
  into v_total
  from public.four_player_match_escrow
  where room_id = p_room_id and status = 'held';

  -- A bot has no wallet. If it wins, the human-funded pool returns to the
  -- system; otherwise the winning human receives every human entry.
  if not coalesce(v_winner_is_bot, false) and v_winner_id is not null then
    update public.profiles
    set points = coalesce(points, 0) + v_total
    where id = v_winner_id;
  end if;

  update public.four_player_match_escrow
  set status = 'settled', settled_at = now()
  where room_id = p_room_id and status = 'held';

  insert into public.match_history(
    user_id, game_title, opponent_name, result, points_change, duration_seconds
  )
  select e.user_id,
         case v_game_key when 'big-two' then 'Big Two' else 'Ludo' end,
         'Four-player arena',
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then 'win' else 'loss' end,
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then v_total else 0 end,
         v_duration
  from public.four_player_match_escrow e
  where e.room_id = p_room_id;

  update public.matchmaking_rooms set status = 'completed' where id = p_room_id;
  return jsonb_build_object(
    'settled', true,
    'winner_seat', p_winner_seat,
    'payout', case when coalesce(v_winner_is_bot, false) then 0 else v_total end,
    'bot_won', coalesce(v_winner_is_bot, false)
  );
end;
$$;

create or replace function public.settle_four_player_result_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winner_seat smallint;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_winner_seat := nullif(new.state ->> 'winner_seat', '')::smallint;
    if v_winner_seat is not null then
      perform public.settle_four_player_room(new.room_id, v_winner_seat);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists settle_big_two_four_player_result on public.big_two_match_state;
create trigger settle_big_two_four_player_result
after update of status on public.big_two_match_state
for each row execute function public.settle_four_player_result_trigger();

drop trigger if exists settle_ludo_four_player_result on public.ludo_match_state;
create trigger settle_ludo_four_player_result
after update of status on public.ludo_match_state
for each row execute function public.settle_four_player_result_trigger();

grant execute on function public.fund_four_player_room(uuid) to authenticated;
grant execute on function public.set_matchmaking_seat_ready(uuid, boolean) to authenticated;
grant execute on function public.settle_four_player_room(uuid, smallint) to authenticated;
