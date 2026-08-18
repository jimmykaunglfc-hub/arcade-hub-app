-- Realtime state transport for Football Clash and future snapshot-based games.
create table if not exists public.multiplayer_game_states (
  match_id text primary key,
  game_key text not null,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists multiplayer_game_states_game_key_idx
  on public.multiplayer_game_states (game_key);

alter table public.multiplayer_game_states enable row level security;

create policy "Authenticated players can read multiplayer state"
  on public.multiplayer_game_states
  for select
  to authenticated
  using (true);

create policy "Authenticated players can create multiplayer state"
  on public.multiplayer_game_states
  for insert
  to authenticated
  with check (updated_by = auth.uid());

create policy "Authenticated players can update multiplayer state"
  on public.multiplayer_game_states
  for update
  to authenticated
  using (true)
  with check (updated_by = auth.uid());

alter publication supabase_realtime add table public.multiplayer_game_states;

-- Register the game in the staging arcade without overwriting admin settings.
insert into public.games (
  title,
  description,
  category,
  entry_fee,
  status,
  is_featured,
  display_weight,
  catalog_label
)
select
  'Football Clash',
  'A live 1v1 penalty shootout with swipe control, wind, and sudden death.',
  'Sports',
  0,
  'active',
  true,
  90,
  'new'
where not exists (
  select 1 from public.games where lower(title) = 'football clash'
);
