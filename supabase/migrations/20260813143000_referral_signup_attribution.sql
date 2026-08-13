-- Attribute a referral as soon as a new auth account is created. The previous
-- client-only flow could be interrupted between account creation and OTP
-- verification, leaving the invitee unlinked and the inviter unrewarded.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base_username text;
  inviter public.profiles;
  cfg public.platform_config;
  rule public.referral_milestone_rules;
  invitee_count integer;
  v_referral_code text := nullif(btrim(new.raw_user_meta_data ->> 'referral_code'), '');
begin
  base_username := lower(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, 'player'), '@', 1),
    'player'
  ), '[^a-zA-Z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);
  if char_length(base_username) < 3 then base_username := 'player'; end if;

  insert into public.profiles (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    left(base_username, 20) || '_' || substr(new.id::text, 1, 6),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  -- An invalid or self-referral must never block account creation. The user
  -- can correct it through the existing apply_referral_code RPC after signup.
  if v_referral_code is null then return new; end if;

  select * into inviter
  from public.profiles
  where lower(public.profiles.referral_code) = lower(v_referral_code)
    and id <> new.id
  for update;
  if not found then return new; end if;

  select * into cfg from public.platform_config where id = 1;
  update public.profiles
  set referred_by = inviter.id,
      points = coalesce(points, 0) + coalesce(cfg.referral_new_user_points, 100)
  where id = new.id and referred_by is null;
  if not found then return new; end if;

  update public.profiles
  set points = coalesce(points, 0) + coalesce(cfg.referral_inviter_points, 500),
      gems = coalesce(gems, 0) + coalesce(cfg.referral_inviter_gems, 10)
  where id = inviter.id;

  select count(*) into invitee_count
  from public.profiles
  where referred_by = inviter.id;
  for rule in
    select * from public.referral_milestone_rules
    where is_active and invitee_target <= invitee_count
  loop
    insert into public.referral_reward_grants(
      inviter_id, invitee_id, rule_type, rule_id, reward_points, reward_gems
    ) values (
      inviter.id, new.id, 'milestone', rule.id, rule.reward_points, rule.reward_gems
    ) on conflict do nothing;
    if found then
      update public.profiles
      set points = coalesce(points, 0) + rule.reward_points,
          gems = coalesce(gems, 0) + rule.reward_gems
      where id = inviter.id;
    end if;
  end loop;

  return new;
end;
$$;
