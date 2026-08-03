-- Presentation and pricing controls for the player wheel. Reward selection
-- remains server-side; the client only renders the configured segments.
alter table public.wheel_rewards
  add column if not exists wheel_color text not null default '#93df25'
    check (wheel_color ~ '^#[0-9A-Fa-f]{6}$');

-- Give existing rewards a useful multi-colour starting palette. Admins can
-- change every segment from the colour picker after the migration.
update public.wheel_rewards
set wheel_color = (array['#93df25', '#c33bd9', '#35a9dc', '#e83b58', '#f6bb22', '#7b879b'])[(mod(display_order, 6) + 1)]
where wheel_color = '#93df25';

alter table public.platform_config
  add column if not exists wheel_spin_cost integer not null default 20
    check (wheel_spin_cost >= 0),
  add column if not exists wheel_spin_currency text not null default 'points'
    check (wheel_spin_currency in ('points', 'gems')),
  add column if not exists wheel_spin_cooldown_hours integer not null default 24
    check (wheel_spin_cooldown_hours between 0 and 168),
  add column if not exists wheel_spin_rules text not null default 'One spin every 24 hours.'
    check (char_length(wheel_spin_rules) <= 180);

create or replace function public.spin_daily_wheel()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  chosen public.wheel_rewards;
  player public.profiles;
  settings public.platform_config;
  roll numeric;
  total numeric;
  charge integer;
  charge_currency text;
  cooldown_hours integer;
  new_balance integer;
begin
  select * into player from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into settings from public.platform_config where id = 1;
  cooldown_hours := greatest(coalesce(settings.wheel_spin_cooldown_hours, 24), 0);
  if cooldown_hours > 0 and player.last_spin is not null and player.last_spin > now() - make_interval(hours => cooldown_hours) then
    raise exception 'Daily spin is still on cooldown';
  end if;

  charge := greatest(coalesce(settings.wheel_spin_cost, 20), 0);
  charge_currency := coalesce(settings.wheel_spin_currency, 'points');
  if charge_currency = 'gems' and coalesce(player.gems, 0) < charge then
    raise exception 'Insufficient gems for this spin';
  elsif charge_currency = 'points' and coalesce(player.points, 0) < charge then
    raise exception 'Insufficient points for this spin';
  end if;

  select coalesce(sum(probability), 0) into total from public.wheel_rewards where is_active;
  if total <= 0 then raise exception 'No wheel rewards are configured'; end if;
  roll := random() * total;
  select r.* into chosen from (
    select r.*, sum(probability) over (order by display_order, id) as threshold
    from public.wheel_rewards r where is_active
  ) r where r.threshold >= roll order by r.threshold limit 1;
  if not found then raise exception 'Could not select a wheel reward'; end if;

  if charge > 0 then
    perform set_config('app.wallet_activity_type', 'wheel_spin_cost', true);
    perform set_config('app.wallet_activity_description', 'Wheel spin entry cost', true);
    if charge_currency = 'gems' then
      update public.profiles set gems = coalesce(gems, 0) - charge where id = auth.uid();
    else
      update public.profiles set points = coalesce(points, 0) - charge where id = auth.uid();
    end if;
  end if;

  perform set_config('app.wallet_activity_type', 'daily_wheel', true);
  perform set_config('app.wallet_activity_description', 'Daily wheel reward: ' || chosen.label, true);
  if chosen.reward_type = 'points' then
    update public.profiles
    set points = coalesce(points, 0) + chosen.reward_value, last_spin = now()
    where id = auth.uid() returning points into new_balance;
  else
    update public.profiles
    set gems = coalesce(gems, 0) + chosen.reward_value, last_spin = now()
    where id = auth.uid() returning gems into new_balance;
  end if;

  return jsonb_build_object(
    'id', chosen.id, 'label', chosen.label, 'type', chosen.reward_type,
    'value', chosen.reward_value, 'balance', new_balance, 'spun_at', now()
  );
end;
$$;

revoke all on function public.spin_daily_wheel() from public;
grant execute on function public.spin_daily_wheel() to authenticated;
