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
  connected_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, seat),
  unique (room_id, user_id)
);

alter table public.matchmaking_rooms enable row level security;
alter table public.matchmaking_room_players enable row level security;
create policy "matchmaking room members can read rooms" on public.matchmaking_rooms for select to authenticated using (true);
create policy "matchmaking room members can read rosters" on public.matchmaking_room_players for select to authenticated using (true);

create index if not exists matchmaking_rooms_queue_idx on public.matchmaking_rooms(game_key, status, expires_at);
create index if not exists matchmaking_room_players_room_idx on public.matchmaking_room_players(room_id, seat);
