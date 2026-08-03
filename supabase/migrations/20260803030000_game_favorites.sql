create table if not exists public.game_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.game_favorites enable row level security;
create policy "users manage their game favorites" on public.game_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
