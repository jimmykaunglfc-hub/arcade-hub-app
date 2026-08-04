-- Roster-aware matchmaking for games with two or four seats.
create table if not exists public.matchmaking_rooms (
  id uuid primary key default gen_random_uuid(),
  game_key text not null,
  room_code text unique not null,
  max_players smallint not null check (max_players in (2, 4)),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'starting', 'playing', 'cancelled', 'completed')),
  fill_bots boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '45 seconds'
);

create table if not exists public.matchmaking_room_players (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  seat smallint not null check (seat between 1 and 4),
  display_name text not null,
  avatar_url text,
  is_bot boolean not null default false,
  ready boolean not null default false,
  connected_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, seat),
  unique (room_id, user_id)
);

-- `create table if not exists` does not evolve a table created by an earlier
-- partial run, so keep the migration rerunnable.
alter table public.matchmaking_room_players add column if not exists ready boolean not null default false;

alter table public.matchmaking_rooms enable row level security;
alter table public.matchmaking_room_players enable row level security;
drop policy if exists "matchmaking room members can read rooms" on public.matchmaking_rooms;
drop policy if exists "matchmaking room members can read rosters" on public.matchmaking_room_players;
create policy "matchmaking room members can read rooms" on public.matchmaking_rooms for select to authenticated using (true);
create policy "matchmaking room members can read rosters" on public.matchmaking_room_players for select to authenticated using (true);

create index if not exists matchmaking_rooms_queue_idx on public.matchmaking_rooms(game_key, status, expires_at);
create index if not exists matchmaking_room_players_room_idx on public.matchmaking_room_players(room_id, seat);

-- A seat becomes ready only when its owner explicitly enters the match. The
-- game client may start only after the room reaches `playing` status.
create or replace function public.set_matchmaking_seat_ready(p_room_id uuid, p_ready boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_humans integer;
  v_unready integer;
begin
  update public.matchmaking_room_players
  set ready = p_ready, connected_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  select count(*) filter (where not is_bot), count(*) filter (where not ready)
  into v_humans, v_unready
  from public.matchmaking_room_players where room_id = p_room_id and left_at is null;

  if v_humans >= 2 and v_unready = 0 then
    update public.matchmaking_rooms set status = 'playing' where id = p_room_id and status in ('waiting', 'starting');
  else
    update public.matchmaking_rooms set status = 'starting' where id = p_room_id and status = 'waiting';
  end if;

  return jsonb_build_object('room_id', p_room_id, 'human_players', v_humans, 'all_ready', v_unready = 0);
end;
$$;

grant execute on function public.set_matchmaking_seat_ready(uuid, boolean) to authenticated;

-- Authoritative game state is kept separately from the lobby roster. Clients
-- subscribe to this row and submit moves through RPCs; they never decide turns.
create table if not exists public.big_two_match_state (
  room_id uuid primary key references public.matchmaking_rooms(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  current_seat smallint not null default 1,
  turn_deadline timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'completed', 'abandoned')),
  updated_at timestamptz not null default now()
);
alter table public.big_two_match_state enable row level security;
drop policy if exists "big two members can read state" on public.big_two_match_state;
create policy "big two members can read state" on public.big_two_match_state for select to authenticated using (
  exists (select 1 from public.matchmaking_room_players p where p.room_id = big_two_match_state.room_id and p.user_id = auth.uid() and p.left_at is null)
);

create or replace function public.big_two_start_match(p_room_id uuid, p_turn_seconds integer default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_host uuid;
begin
  select host_id into v_host from public.matchmaking_rooms where id = p_room_id;
  select count(*) into v_count from public.matchmaking_room_players where room_id = p_room_id and left_at is null;
  if v_host is distinct from auth.uid() or v_count <> 4 then raise exception 'A four-player host room is required'; end if;
  update public.matchmaking_rooms set status = 'playing' where id = p_room_id;
  insert into public.big_two_match_state(room_id, status, current_seat, turn_deadline)
  values (p_room_id, 'playing', 1, now() + make_interval(secs => greatest(10, least(p_turn_seconds, 90))))
  on conflict (room_id) do update set status = 'playing', current_seat = 1, turn_deadline = excluded.turn_deadline, updated_at = now();
  return jsonb_build_object('room_id', p_room_id, 'current_seat', 1);
end;
$$;
grant execute on function public.big_two_start_match(uuid, integer) to authenticated;

-- Read model used by the lobby UI for four stable seats, names, avatars and
-- ready indicators. Realtime subscriptions on these tables update all clients.
create or replace function public.get_matchmaking_room(p_room_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'game_key', r.game_key, 'room_code', r.room_code,
    'max_players', r.max_players, 'status', r.status, 'fill_bots', r.fill_bots,
    'expires_at', r.expires_at,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'seat', p.seat, 'user_id', p.user_id, 'name', p.display_name,
      'avatar_url', p.avatar_url, 'is_bot', p.is_bot, 'ready', p.ready
    ) order by p.seat) from public.matchmaking_room_players p where p.room_id = r.id and p.left_at is null), '[]'::jsonb)
  ) from public.matchmaking_rooms r where r.id = p_room_id;
$$;
grant execute on function public.get_matchmaking_room(uuid) to authenticated;

create or replace function public.join_four_player_queue(p_game_key text, p_name text, p_avatar_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_seat smallint; v_code text;
begin
  select r.id into v_room from public.matchmaking_rooms r
  where r.game_key = lower(p_game_key) and r.max_players = 4 and r.status = 'waiting' and r.expires_at > now()
    and (select count(*) from public.matchmaking_room_players p where p.room_id = r.id and p.left_at is null) < 4
  order by r.created_at for update skip locked limit 1;
  if v_room is null then
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into public.matchmaking_rooms(game_key, room_code, max_players, host_id) values(lower(p_game_key), v_code, 4, auth.uid()) returning id into v_room;
  end if;
  select coalesce(min(s), 5) into v_seat from generate_series(1,4) s where not exists (select 1 from public.matchmaking_room_players p where p.room_id=v_room and p.seat=s and p.left_at is null);
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,avatar_url) values(v_room,auth.uid(),v_seat,coalesce(nullif(p_name,''),'Player'),p_avatar_url)
  on conflict (room_id,user_id) do update set connected_at=now(),left_at=null;
  return v_room;
end; $$;
grant execute on function public.join_four_player_queue(text,text,text) to authenticated;
