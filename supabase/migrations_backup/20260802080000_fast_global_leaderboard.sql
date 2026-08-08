create index if not exists profiles_points_leaderboard_idx on public.profiles (points desc nulls last);

create or replace function public.get_global_leaderboard()
returns table (id uuid, username text, avatar_url text, points bigint, gems bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url, coalesce(p.points, 0)::bigint, coalesce(p.gems, 0)::bigint
  from public.profiles p
  order by p.points desc nulls last, p.created_at asc
  limit 50;
$$;

revoke all on function public.get_global_leaderboard() from public;
grant execute on function public.get_global_leaderboard() to authenticated;
