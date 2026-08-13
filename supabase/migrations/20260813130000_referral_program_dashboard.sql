-- Expose only the referral settings a signed-in player needs to understand the
-- current program. platform_config itself remains admin-only under RLS.
create or replace function public.get_my_referral_program()
returns table(
  invited integer,
  earned integer,
  inviter_points integer,
  inviter_gems integer,
  new_user_points integer
)
language sql
security definer
set search_path = public
as $$
  with config as (
    select
      coalesce(max(referral_inviter_points), 0)::integer as inviter_points,
      coalesce(max(referral_inviter_gems), 0)::integer as inviter_gems,
      coalesce(max(referral_new_user_points), 0)::integer as new_user_points
    from public.platform_config
    where id = 1
  ), invitees as (
    select count(*)::integer as invited
    from public.profiles
    where referred_by = auth.uid()
  )
  select
    invitees.invited,
    (invitees.invited * config.inviter_points)::integer as earned,
    config.inviter_points,
    config.inviter_gems,
    config.new_user_points
  from invitees cross join config;
$$;

create or replace function public.get_my_referral_invitees()
returns table(
  username text,
  network_id text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.username, p.network_id, p.created_at
  from public.profiles p
  where p.referred_by = auth.uid()
  order by p.created_at desc;
$$;

revoke all on function public.get_my_referral_program() from public;
revoke all on function public.get_my_referral_invitees() from public;
grant execute on function public.get_my_referral_program() to authenticated;
grant execute on function public.get_my_referral_invitees() to authenticated;
notify pgrst, 'reload schema';
