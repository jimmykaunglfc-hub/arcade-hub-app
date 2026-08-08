-- Server-owned referral identity and rewards. Codes are permanent and rewards
-- can be tuned from the single platform configuration row.
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id);
create unique index if not exists profiles_referral_code_unique on public.profiles (lower(referral_code));

alter table public.platform_config
  add column if not exists referral_inviter_points integer not null default 500 check (referral_inviter_points >= 0),
  add column if not exists referral_inviter_gems integer not null default 10 check (referral_inviter_gems >= 0),
  add column if not exists referral_new_user_points integer not null default 100 check (referral_new_user_points >= 0);

create or replace function public.assign_profile_referral_code()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  return new;
end; $$;
drop trigger if exists profiles_assign_referral_code on public.profiles;
create trigger profiles_assign_referral_code before insert or update of referral_code on public.profiles for each row execute function public.assign_profile_referral_code();
update public.profiles set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8)) where referral_code is null;
alter table public.profiles alter column referral_code set not null;

create or replace function public.apply_referral_code(p_referral_code text)
returns void language plpgsql security definer set search_path=public as $$
declare me public.profiles; inviter public.profiles; cfg public.platform_config;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if me.referred_by is not null then raise exception 'A referral has already been applied'; end if;
  select * into inviter from public.profiles where lower(referral_code) = lower(btrim(p_referral_code)) for update;
  if not found or inviter.id = me.id then raise exception 'Referral code is invalid'; end if;
  select * into cfg from public.platform_config where id = 1;
  update public.profiles set referred_by = inviter.id, points = coalesce(points,0) + coalesce(cfg.referral_new_user_points,100) where id = me.id;
  update public.profiles set points = coalesce(points,0) + coalesce(cfg.referral_inviter_points,500), gems = coalesce(gems,0) + coalesce(cfg.referral_inviter_gems,10) where id = inviter.id;
end; $$;
revoke all on function public.apply_referral_code(text) from public;
grant execute on function public.apply_referral_code(text) to authenticated;

create or replace function public.get_my_referral_dashboard()
returns table(invited integer, earned integer) language sql security definer set search_path=public as $$
  select count(*)::integer, count(*)::integer * coalesce((select referral_inviter_points from public.platform_config where id = 1), 500)
  from public.profiles where referred_by = auth.uid();
$$;
grant execute on function public.get_my_referral_dashboard() to authenticated;

create or replace function public.get_my_referral_invitees()
returns table(username text, network_id text, created_at timestamptz) language sql security definer set search_path=public as $$
  select p.username, p.network_id, p.created_at from public.profiles p where p.referred_by = auth.uid() order by p.created_at desc;
$$;
grant execute on function public.get_my_referral_invitees() to authenticated;
