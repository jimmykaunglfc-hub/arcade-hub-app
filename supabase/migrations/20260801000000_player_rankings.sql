-- Lifetime competitive ranking, derived from completed match_history records.
-- The ranking source is intentionally match_history rather than profile counters so
-- historical results are included and no client can write its own rank.

alter table public.match_history
  add column if not exists duration_seconds integer not null default 0
  check (duration_seconds >= 0);

-- Older result rows predate duration tracking. Preserve a useful lifetime
-- play-time baseline with a clearly bounded three-minute per-match estimate;
-- all new completed matches receive their measured client session duration.
update public.match_history
set duration_seconds = 180
where duration_seconds = 0
  and lower(coalesce(result, '')) in ('win', 'victory', 'loss', 'defeat', 'draw');

alter table public.rank_badges
  add column if not exists rank_key text;

create unique index if not exists rank_badges_rank_key_unique
  on public.rank_badges (rank_key)
  where rank_key is not null;

create or replace function public.get_player_rank_summary()
returns table (
  tier text,
  percentile integer,
  global_rank integer,
  ranked_players integer,
  rating integer,
  matches integer,
  wins integer,
  draws integer,
  win_rate numeric,
  playtime_seconds bigint,
  badge_icon_url text
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
  ),
  scored as (
    select
      user_id,
      matches,
      wins,
      draws,
      playtime_seconds,
      round(
        1000
        + 500 * (((wins + draws * 0.5)::numeric / nullif(matches, 0)) - 0.5)
        + least(matches, 50) * 4
      )::integer as rating
    from completed
    where matches >= 5
  ),
  leaderboard as (
    select
      *,
      rank() over (order by rating desc, wins desc, matches desc, user_id) as global_rank,
      count(*) over () as ranked_players
    from scored
  ),
  mine as (
    select
      coalesce(c.matches, 0) as matches,
      coalesce(c.wins, 0) as wins,
      coalesce(c.draws, 0) as draws,
      coalesce(c.playtime_seconds, 0)::bigint as playtime_seconds,
      l.rating,
      l.global_rank,
      l.ranked_players
    from (select auth.uid() as user_id) me
    left join completed c on c.user_id = me.user_id
    left join leaderboard l on l.user_id = me.user_id
  ),
  presentation as (
    select
      *,
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
    end as tier,
    percentile,
    global_rank,
    ranked_players,
    coalesce(rating, 1000) as rating,
    matches,
    wins,
    draws,
    case when matches = 0 then 0 else round(((wins + draws * 0.5)::numeric / matches) * 100, 1) end as win_rate,
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
    ) as badge_icon_url
  from presentation;
$$;

revoke all on function public.get_player_rank_summary() from public;
grant execute on function public.get_player_rank_summary() to authenticated;
