-- Fetch leaderboard rows in small, stable pages. Profile-card decoration is
-- intentionally performed by the client only for the rows on screen.
create index if not exists profiles_xp_leaderboard_page_idx
  on public.profiles (xp desc nulls last, created_at asc, id asc);

create or replace function public.get_global_leaderboard_page(
  p_offset integer default 0,
  p_limit integer default 10
)
returns table (id uuid, username text, avatar_url text, xp bigint, gems bigint)
language sql stable security definer set search_path=public as $$
  select p.id, p.username, p.avatar_url, p.xp, p.gems
  from public.profiles p
  where greatest(coalesce(p_offset, 0), 0) < 50
  order by p.xp desc nulls last, p.created_at asc, p.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(
    greatest(coalesce(p_limit, 10), 1),
    10,
    greatest(50 - greatest(coalesce(p_offset, 0), 0), 0)
  );
$$;

revoke all on function public.get_global_leaderboard_page(integer, integer) from public;
grant execute on function public.get_global_leaderboard_page(integer, integer) to authenticated;
