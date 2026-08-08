alter table public.tournaments add column if not exists rules text not null default '', add column if not exists terms text not null default '', add column if not exists participation_points integer not null default 0, add column if not exists participation_gems integer not null default 0, add column if not exists participation_badge_id uuid references public.rank_badges(id);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, status text not null default 'registered' check (status in ('registered','participated','eliminated','winner')), placement integer, score integer not null default 0, joined_at timestamptz not null default now(), completed_at timestamptz, unique(tournament_id, user_id)
);
create table if not exists public.tournament_awards (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade, placement integer not null, points integer not null default 0, gems integer not null default 0, badge_id uuid references public.rank_badges(id), unique(tournament_id, placement)
);
create index if not exists tournament_entries_user_idx on public.tournament_entries(user_id, joined_at desc);
alter table public.tournament_entries enable row level security;
create policy "players read entries" on public.tournament_entries for select to authenticated using (true);
create policy "players register themselves" on public.tournament_entries for insert to authenticated with check (user_id = auth.uid());
create policy "admins manage entries" on public.tournament_entries for all to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin')) with check ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));

create or replace function public.register_for_tournament(target_tournament uuid) returns public.tournament_entries language plpgsql security definer set search_path=public as $$
declare event public.tournaments; entry public.tournament_entries;
begin
  select * into event from public.tournaments where id=target_tournament for update;
  if not found or event.status not in ('upcoming','active') then raise exception 'Tournament is not open for registration'; end if;
  if coalesce(event.registered_count,0) >= event.max_players then raise exception 'Tournament is full'; end if;
  insert into public.tournament_entries(tournament_id,user_id) values(target_tournament,auth.uid()) returning * into entry;
  update public.tournaments set registered_count=coalesce(registered_count,0)+1 where id=target_tournament;
  return entry;
end; $$;
grant execute on function public.register_for_tournament(uuid) to authenticated;
