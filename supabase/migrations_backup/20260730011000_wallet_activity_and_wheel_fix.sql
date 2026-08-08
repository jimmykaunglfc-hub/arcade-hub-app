-- Make every wheel payout an atomic wallet mutation and activity-log entry.
alter table public.financial_audit_logs
  add column if not exists currency_type text not null default 'points'
  check (currency_type in ('points', 'gems'));

create or replace function public.spin_daily_wheel()
returns jsonb language plpgsql security definer set search_path = public as $$
declare chosen public.wheel_rewards; player public.profiles; roll numeric; total numeric; new_balance integer;
begin
  select * into player from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if player.last_spin is not null and player.last_spin > now() - interval '24 hours' then raise exception 'Daily spin is still on cooldown'; end if;
  select coalesce(sum(probability), 0) into total from public.wheel_rewards where is_active;
  if total <= 0 then raise exception 'No wheel rewards are configured'; end if;
  roll := random() * total;
  select r.* into chosen from (select r.*, sum(probability) over (order by display_order, id) as threshold from public.wheel_rewards r where is_active) r where r.threshold >= roll order by r.threshold limit 1;
  if not found then raise exception 'Could not select a wheel reward'; end if;
  if chosen.reward_type = 'points' then
    update public.profiles set points = coalesce(points, 0) + chosen.reward_value, last_spin = now() where id = auth.uid() returning points into new_balance;
  else
    update public.profiles set gems = coalesce(gems, 0) + chosen.reward_value, last_spin = now() where id = auth.uid() returning gems into new_balance;
  end if;
  insert into public.financial_audit_logs (user_id, amount, balance_snapshot, currency_type, mutation_type, description)
  values (auth.uid(), chosen.reward_value, new_balance, chosen.reward_type, 'daily_wheel', 'Daily wheel reward: ' || chosen.label);
  return jsonb_build_object('id', chosen.id, 'label', chosen.label, 'type', chosen.reward_type, 'value', chosen.reward_value, 'balance', new_balance, 'spun_at', now());
end; $$;
