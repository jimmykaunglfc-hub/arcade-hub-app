-- Some live projects predate the managed wheel configuration fields. The
-- admin Configurations form saves all platform settings together, so one
-- absent wheel column prevents unrelated controls (including group pricing)
-- from being saved.
alter table public.platform_config
  add column if not exists wheel_spin_cost integer not null default 20,
  add column if not exists wheel_spin_currency text not null default 'points',
  add column if not exists wheel_spin_cooldown_hours integer not null default 24,
  add column if not exists wheel_spin_rules text not null default 'One spin every 24 hours.';

alter table public.platform_config
  drop constraint if exists platform_config_wheel_spin_cost_check,
  add constraint platform_config_wheel_spin_cost_check check (wheel_spin_cost >= 0),
  drop constraint if exists platform_config_wheel_spin_currency_check,
  add constraint platform_config_wheel_spin_currency_check check (wheel_spin_currency in ('points', 'gems')),
  drop constraint if exists platform_config_wheel_spin_cooldown_hours_check,
  add constraint platform_config_wheel_spin_cooldown_hours_check check (wheel_spin_cooldown_hours between 0 and 168);

notify pgrst, 'reload schema';
