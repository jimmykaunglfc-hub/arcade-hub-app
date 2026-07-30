-- Server-managed daily wheel. Configure rewards in wheel_rewards; the RPC is
-- the only code path that selects and pays a reward.
create table if not exists public.wheel_rewards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  reward_type text not null check (reward_type in ('points', 'gems')),
  reward_value integer not null check (reward_value > 0),
  probability numeric not null check (probability > 0),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.wheel_rewards enable row level security;
create policy "wheel rewards are readable" on public.wheel_rewards for select to authenticated using (true);
create policy "admins manage wheel rewards" on public.wheel_rewards for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

create or replace function public.spin_daily_wheel()
returns jsonb language plpgsql security definer set search_path = public as $$
declare chosen public.wheel_rewards; player public.profiles; roll numeric; total numeric; cursor numeric := 0;
begin
  select * into player from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if player.last_spin is not null and player.last_spin > now() - interval '24 hours' then raise exception 'Daily spin is still on cooldown'; end if;
  select coalesce(sum(probability), 0) into total from public.wheel_rewards where is_active;
  if total = 0 then raise exception 'No wheel rewards are configured'; end if;
  roll := random() * total;
  select r.* into chosen from (select r.*, sum(probability) over (order by display_order, id) as threshold from public.wheel_rewards r where is_active) r where threshold >= roll order by threshold limit 1;
  if chosen.reward_type = 'points' then update public.profiles set points = coalesce(points, 0) + chosen.reward_value, last_spin = now() where id = auth.uid();
  else update public.profiles set gems = coalesce(gems, 0) + chosen.reward_value, last_spin = now() where id = auth.uid(); end if;
  insert into public.financial_audit_logs (user_id, amount, balance_snapshot, mutation_type, description) select auth.uid(), chosen.reward_value, points, 'daily_wheel', 'Daily wheel: ' || chosen.label from public.profiles where id = auth.uid() and chosen.reward_type = 'points';
  return jsonb_build_object('id', chosen.id, 'label', chosen.label, 'type', chosen.reward_type, 'value', chosen.reward_value, 'spun_at', now());
end; $$;
grant execute on function public.spin_daily_wheel() to authenticated;
