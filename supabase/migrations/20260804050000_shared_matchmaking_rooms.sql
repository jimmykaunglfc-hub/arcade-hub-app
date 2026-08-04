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
