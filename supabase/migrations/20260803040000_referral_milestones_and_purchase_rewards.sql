-- Admin-configurable referral milestones and purchase commissions. Purchases
-- must be submitted by a verified server-side payment webhook, never the app.
create table if not exists public.referral_milestone_rules (
  id uuid primary key default gen_random_uuid(),
  invitee_target integer not null unique check (invitee_target > 0),
  reward_points integer not null default 0 check (reward_points >= 0),
  reward_gems integer not null default 0 check (reward_gems >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (reward_points > 0 or reward_gems > 0)
);
create table if not exists public.referral_purchase_rules (
  id uuid primary key default gen_random_uuid(),
  minimum_purchase_amount numeric(12,2) not null check (minimum_purchase_amount > 0),
  purchase_currency text not null default 'usd',
  reward_points integer not null default 0 check (reward_points >= 0),
  reward_gems integer not null default 0 check (reward_gems >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (reward_points > 0 or reward_gems > 0)
);
create table if not exists public.referral_reward_grants (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete set null,
  rule_type text not null check (rule_type in ('milestone','purchase')),
  rule_id uuid not null,
  purchase_id text,
  reward_points integer not null default 0,
  reward_gems integer not null default 0,
  created_at timestamptz not null default now(),
  unique(inviter_id, rule_type, rule_id, invitee_id),
  unique(purchase_id, rule_id)
);
create unique index if not exists referral_milestone_once_per_inviter_idx
  on public.referral_reward_grants (inviter_id, rule_id) where rule_type = 'milestone';
alter table public.referral_milestone_rules enable row level security;
alter table public.referral_purchase_rules enable row level security;
alter table public.referral_reward_grants enable row level security;
create policy "admins manage referral milestone rules" on public.referral_milestone_rules for all to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin')) with check ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));
create policy "admins manage referral purchase rules" on public.referral_purchase_rules for all to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin')) with check ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));
create policy "users view own referral grants" on public.referral_reward_grants for select to authenticated using (inviter_id=auth.uid());
create policy "admins view referral grants" on public.referral_reward_grants for select to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));

create or replace function public.award_referral_purchase(p_buyer_id uuid, p_purchase_id text, p_amount numeric, p_currency text default 'usd')
returns void language plpgsql security definer set search_path=public as $$
declare buyer public.profiles; rule public.referral_purchase_rules;
begin
  select * into buyer from public.profiles where id=p_buyer_id;
  if buyer.referred_by is null then return; end if;
  for rule in select * from public.referral_purchase_rules where is_active and lower(purchase_currency)=lower(p_currency) and p_amount >= minimum_purchase_amount loop
    insert into public.referral_reward_grants(inviter_id, invitee_id, rule_type, rule_id, purchase_id, reward_points, reward_gems)
    values(buyer.referred_by, buyer.id, 'purchase', rule.id, p_purchase_id, rule.reward_points, rule.reward_gems)
    on conflict do nothing;
    if found then update public.profiles set points=coalesce(points,0)+rule.reward_points, gems=coalesce(gems,0)+rule.reward_gems where id=buyer.referred_by; end if;
  end loop;
end; $$;
revoke all on function public.award_referral_purchase(uuid,text,numeric,text) from public, authenticated;

create or replace function public.apply_referral_code(p_referral_code text)
returns void language plpgsql security definer set search_path=public as $$
declare me public.profiles; inviter public.profiles; cfg public.platform_config; rule public.referral_milestone_rules; invitee_count integer;
begin
  select * into me from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if me.referred_by is not null then raise exception 'A referral has already been applied'; end if;
  select * into inviter from public.profiles where lower(referral_code)=lower(btrim(p_referral_code)) for update;
  if not found or inviter.id=me.id then raise exception 'Referral code is invalid'; end if;
  select * into cfg from public.platform_config where id=1;
  update public.profiles set referred_by=inviter.id, points=coalesce(points,0)+coalesce(cfg.referral_new_user_points,100) where id=me.id;
  update public.profiles set points=coalesce(points,0)+coalesce(cfg.referral_inviter_points,500), gems=coalesce(gems,0)+coalesce(cfg.referral_inviter_gems,10) where id=inviter.id;
  select count(*) into invitee_count from public.profiles where referred_by=inviter.id;
  for rule in select * from public.referral_milestone_rules where is_active and invitee_target <= invitee_count loop
    insert into public.referral_reward_grants(inviter_id, invitee_id, rule_type, rule_id, reward_points, reward_gems)
    values(inviter.id, me.id, 'milestone', rule.id, rule.reward_points, rule.reward_gems) on conflict do nothing;
    if found then update public.profiles set points=coalesce(points,0)+rule.reward_points, gems=coalesce(gems,0)+rule.reward_gems where id=inviter.id; end if;
  end loop;
end; $$;
grant execute on function public.apply_referral_code(text) to authenticated;
