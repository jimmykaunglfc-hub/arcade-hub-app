-- Keep the home rank card on the same global ordering as the public leaderboard.
-- The public leaderboard ranks every profile by XP, then creation time and ID.
-- Match-only rating is still retained below for match statistics and rank badges.
create or replace function public.get_player_rank_summary()
returns table (
  tier             text,
  percentile       integer,
  global_rank      integer,
  ranked_players   integer,
  rating           integer,
  matches          integer,
  wins             integer,
  draws            integer,
  win_rate         numeric,
  playtime_seconds bigint,
  badge_icon_url   text
)
language sql
security definer
set search_path = public
as $$
  with completed as (
    select
      user_id,
      count(*)::integer as matches,
      count(*) filter (where lower(coalesce(result, '')) in ('win', 'victory'))::integer as wins,
      count(*) filter (where lower(coalesce(result, '')) = 'draw')::integer as draws,
      coalesce(sum(duration_seconds), 0)::bigint as playtime_seconds
    from public.match_history
    where lower(coalesce(result, '')) in ('win', 'victory', 'loss', 'defeat', 'draw')
    group by user_id
  ), profile_leaderboard as (
    select
      p.id as user_id,
      (row_number() over (order by p.xp desc nulls last, p.created_at asc, p.id asc))::integer as global_rank,
      (count(*) over ())::integer as ranked_players
    from public.profiles p
  ), mine as (
    select
      coalesce(c.matches, 0)::integer as matches,
      coalesce(c.wins, 0)::integer as wins,
      coalesce(c.draws, 0)::integer as draws,
      coalesce(c.playtime_seconds, 0)::bigint as playtime_seconds,
      l.global_rank,
      l.ranked_players
    from (select auth.uid() as user_id) me
    left join completed c on c.user_id = me.user_id
    left join profile_leaderboard l on l.user_id = me.user_id
  ), presentation as (
    select
      *,
      round(1000 + 500 * (((wins + draws * .5)::numeric / nullif(matches, 0)) - .5) + least(matches, 50) * 4)::integer as rating,
      case
        when global_rank is null then null
        when ranked_players = 1 then 1
        else greatest(1, ceil(global_rank::numeric / ranked_players * 100)::integer)
      end as percentile
    from mine
  )
  select
    case
      when global_rank is null then 'Unranked'
      when percentile <= 1 then 'Master'
      when percentile <= 5 then 'Diamond'
      when percentile <= 20 then 'Platinum'
      when percentile <= 45 then 'Gold'
      when percentile <= 75 then 'Silver'
      else 'Bronze'
    end,
    percentile,
    global_rank,
    ranked_players,
    coalesce(rating, 1000),
    matches,
    wins,
    draws,
    case when matches = 0 then 0 else round(((wins + draws * .5)::numeric / matches) * 100, 1) end,
    playtime_seconds,
    (
      select b.icon_url
      from public.rank_badges b
      where b.is_active
        and b.rank_key = lower(
          case
            when global_rank is null then 'Unranked'
            when percentile <= 1 then 'Master'
            when percentile <= 5 then 'Diamond'
            when percentile <= 20 then 'Platinum'
            when percentile <= 45 then 'Gold'
            when percentile <= 75 then 'Silver'
            else 'Bronze'
          end
        )
      limit 1
    )
  from presentation;
$$;

revoke all on function public.get_player_rank_summary() from public;
grant execute on function public.get_player_rank_summary() to anon, authenticated, service_role;
