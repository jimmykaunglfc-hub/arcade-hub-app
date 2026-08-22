-- Daily login rewards change economic state, so they must be calculated and
-- applied in one trusted, atomic database operation rather than by the client.
create or replace function public.claim_daily_login_reward()
returns table(
  points_awarded integer,
  new_points_balance integer,
  claimed_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player public.profiles;
  v_base_reward integer := 1000;
  v_multiplier numeric := 1;
  v_points_awarded integer;
  v_claimed_at timestamp with time zone := timezone('utc', now());
  v_last_claim timestamp with time zone;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- The row lock makes simultaneous requests from multiple devices safe.
  select * into v_player
  from public.profiles
  where id = v_user_id
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  v_last_claim := coalesce(v_player.last_daily_claim_at, v_player.last_login_claim);
  if v_last_claim is not null
    and (v_last_claim at time zone 'UTC')::date >= (v_claimed_at at time zone 'UTC')::date then
    raise exception 'Daily login reward has already been claimed today';
  end if;

  -- Keep the existing 1,000-point fallback for installations without an
  -- Admin-created daily-login rule, while making the server authoritative.
  select coalesce(r.reward_points, 1000) into v_base_reward
  from public.reward_rules r
  where r.is_active = true
    and r.trigger_event = 'daily_login'
  order by r.created_at desc, r.id desc
  limit 1;
  v_base_reward := greatest(coalesce(v_base_reward, 1000), 0);

  select coalesce(c.global_point_multiplier, 1) into v_multiplier
  from public.platform_config c
  where c.id = 1;
  v_multiplier := greatest(coalesce(v_multiplier, 1), 0);
  v_points_awarded := greatest(round(v_base_reward * v_multiplier)::integer, 0);

  perform set_config('app.wallet_activity_type', 'daily_login', true);
  perform set_config(
    'app.wallet_activity_description',
    format('Daily login reward: %s points', v_points_awarded),
    true
  );

  update public.profiles
  set points = coalesce(points, 0) + v_points_awarded,
      last_daily_claim_at = v_claimed_at,
      last_login_claim = v_claimed_at
  where id = v_user_id
  returning points into new_points_balance;

  insert into public.daily_claims (user_id, points_awarded, claimed_at)
  values (v_user_id, v_points_awarded, v_claimed_at);

  return query select v_points_awarded, new_points_balance, v_claimed_at;
end;
$$;

revoke all on function public.claim_daily_login_reward() from public, anon;
grant execute on function public.claim_daily_login_reward() to authenticated, service_role;

notify pgrst, 'reload schema';
