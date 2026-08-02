-- Profile appearance pricing is owned by the backend. The first complete
-- profile edit is free; every later edit uses this centrally managed price.
alter table public.profiles
  add column if not exists profile_edit_count integer not null default 0;

alter table public.platform_config
  add column if not exists profile_edit_cost integer not null default 100,
  add column if not exists profile_edit_currency text not null default 'points'
    check (profile_edit_currency in ('points', 'gems'));

create or replace function public.update_profile_identity(
  new_username text default null,
  new_avatar_url text default null
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  settings public.platform_config;
  changed boolean := false;
  charge integer := 0;
begin
  select * into current_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into settings from public.platform_config where id = 1;

  new_username := nullif(btrim(coalesce(new_username, '')), '');
  if new_username is null then new_username := current_profile.username; end if;
  if length(new_username) > 30 then raise exception 'Display name must be 30 characters or fewer'; end if;
  new_avatar_url := nullif(btrim(coalesce(new_avatar_url, '')), '');

  changed := new_username <> current_profile.username
    or new_avatar_url is distinct from current_profile.avatar_url;
  if not changed then return current_profile; end if;

  if current_profile.profile_edit_count > 0 then
    charge := greatest(coalesce(settings.profile_edit_cost, 100), 0);
    if coalesce(settings.profile_edit_currency, 'points') = 'gems' then
      if coalesce(current_profile.gems, 0) < charge then raise exception 'Insufficient gems'; end if;
    elsif coalesce(current_profile.points, 0) < charge then
      raise exception 'Insufficient points';
    end if;
  end if;

  update public.profiles
  set username = new_username,
      avatar_url = new_avatar_url,
      points = coalesce(points, 0) - case when coalesce(settings.profile_edit_currency, 'points') = 'points' then charge else 0 end,
      gems = coalesce(gems, 0) - case when coalesce(settings.profile_edit_currency, 'points') = 'gems' then charge else 0 end,
      profile_edit_count = profile_edit_count + 1
  where id = auth.uid()
  returning * into current_profile;

  if charge > 0 then
    insert into public.wallet_activity_logs (user_id, amount, balance_snapshot, currency_type, activity_type, description)
    values (
      auth.uid(), -charge,
      case when coalesce(settings.profile_edit_currency, 'points') = 'gems' then current_profile.gems else current_profile.points end,
      coalesce(settings.profile_edit_currency, 'points'), 'profile_update', 'Profile appearance update'
    );
  end if;
  return current_profile;
end;
$$;

revoke all on function public.update_profile_identity(text, text) from public;
grant execute on function public.update_profile_identity(text, text) to authenticated;

-- Any completed match earns a current-season place. The previous five-match
-- threshold was the reason active players were shown as Unranked.
create or replace function public.get_player_rank_summary()
returns table (tier text, percentile integer, global_rank integer, ranked_players integer, rating integer, matches integer, wins integer, draws integer, win_rate numeric, playtime_seconds bigint, badge_icon_url text)
language sql security definer set search_path = public
as $$
  with completed as (
    select user_id, count(*)::integer matches,
      count(*) filter (where lower(coalesce(result, '')) in ('win', 'victory'))::integer wins,
      count(*) filter (where lower(coalesce(result, '')) = 'draw')::integer draws,
      coalesce(sum(duration_seconds), 0)::bigint playtime_seconds
    from public.match_history
    where lower(coalesce(result, '')) in ('win', 'victory', 'loss', 'defeat', 'draw')
    group by user_id
  ), scored as (
    select user_id, matches, wins, draws, playtime_seconds,
      round(1000 + 500 * (((wins + draws * .5)::numeric / nullif(matches, 0)) - .5) + least(matches, 50) * 4)::integer rating
    from completed
  ), leaderboard as (
    select *, rank() over (order by rating desc, wins desc, matches desc, user_id) global_rank, count(*) over () ranked_players from scored
  ), mine as (
    select coalesce(c.matches, 0) matches, coalesce(c.wins, 0) wins, coalesce(c.draws, 0) draws, coalesce(c.playtime_seconds, 0)::bigint playtime_seconds,
      l.rating, l.global_rank, l.ranked_players
    from (select auth.uid() user_id) me left join completed c on c.user_id = me.user_id left join leaderboard l on l.user_id = me.user_id
  ), presentation as (
    select *, case when global_rank is null then null when ranked_players = 1 then 1 else greatest(1, ceil(global_rank::numeric / ranked_players * 100)::integer) end percentile from mine
  )
  select case when global_rank is null then 'Unranked' when percentile <= 1 then 'Master' when percentile <= 5 then 'Diamond' when percentile <= 20 then 'Platinum' when percentile <= 45 then 'Gold' when percentile <= 75 then 'Silver' else 'Bronze' end,
    percentile, global_rank, ranked_players, coalesce(rating, 1000), matches, wins, draws,
    case when matches = 0 then 0 else round(((wins + draws * .5)::numeric / matches) * 100, 1) end, playtime_seconds,
    (select b.icon_url from public.rank_badges b where b.is_active and b.rank_key = lower(case when global_rank is null then 'Unranked' when percentile <= 1 then 'Master' when percentile <= 5 then 'Diamond' when percentile <= 20 then 'Platinum' when percentile <= 45 then 'Gold' when percentile <= 75 then 'Silver' else 'Bronze' end) limit 1)
  from presentation;
$$;

revoke all on function public.get_player_rank_summary() from public;
grant execute on function public.get_player_rank_summary() to authenticated;
