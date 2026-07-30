-- Immutable wallet evidence: captures every profile balance mutation, including
-- changes made by the wheel, games, rewards, store purchases, and admins.
create table if not exists public.wallet_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  currency_type text not null check (currency_type in ('points', 'gems')),
  amount integer not null check (amount <> 0),
  balance_snapshot integer not null,
  activity_type text not null default 'profile_balance_change',
  description text not null default 'Wallet balance updated',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_activity_logs_user_created_idx on public.wallet_activity_logs (user_id, created_at desc);

create or replace function public.log_wallet_balance_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare activity text := coalesce(nullif(current_setting('app.wallet_activity_type', true), ''), 'profile_balance_change'); detail text := coalesce(nullif(current_setting('app.wallet_activity_description', true), ''), 'Wallet balance updated');
begin
  if coalesce(new.points, 0) <> coalesce(old.points, 0) then
    insert into public.wallet_activity_logs (user_id, currency_type, amount, balance_snapshot, activity_type, description)
    values (new.id, 'points', coalesce(new.points, 0) - coalesce(old.points, 0), coalesce(new.points, 0), activity, detail);
  end if;
  if coalesce(new.gems, 0) <> coalesce(old.gems, 0) then
    insert into public.wallet_activity_logs (user_id, currency_type, amount, balance_snapshot, activity_type, description)
    values (new.id, 'gems', coalesce(new.gems, 0) - coalesce(old.gems, 0), coalesce(new.gems, 0), activity, detail);
  end if;
  return new;
end; $$;

drop trigger if exists wallet_activity_audit on public.profiles;
create trigger wallet_activity_audit after update of points, gems on public.profiles for each row execute function public.log_wallet_balance_change();

alter table public.wallet_activity_logs enable row level security;
create policy "users read their wallet activity" on public.wallet_activity_logs for select to authenticated using (user_id = auth.uid());
create policy "admins read wallet activity" on public.wallet_activity_logs for select to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

-- Label the trigger-created entry for future wheel spins. This replaces the
-- function from the prior migration without relying on client-side logging.
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
  perform set_config('app.wallet_activity_type', 'daily_wheel', true);
  perform set_config('app.wallet_activity_description', 'Daily wheel reward: ' || chosen.label, true);
  if chosen.reward_type = 'points' then update public.profiles set points = coalesce(points, 0) + chosen.reward_value, last_spin = now() where id = auth.uid() returning points into new_balance;
  else update public.profiles set gems = coalesce(gems, 0) + chosen.reward_value, last_spin = now() where id = auth.uid() returning gems into new_balance;
  end if;
  return jsonb_build_object('id', chosen.id, 'label', chosen.label, 'type', chosen.reward_type, 'value', chosen.reward_value, 'balance', new_balance, 'spun_at', now());
end; $$;
