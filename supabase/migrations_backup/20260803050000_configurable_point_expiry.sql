-- Configurable balance expiry. This is intentionally a transparent, scheduled
-- balance policy rather than silently changing a player's wallet on the client.
insert into public.system_settings (key, value, updated_at)
values ('points_expiry_config', '{"enabled":false,"schedule":"quarterly","retention_percent":0,"minimum_balance":0}'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.expire_points_by_policy(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  last_run timestamptz;
  interval_due interval;
  affected integer := 0;
  retained numeric;
  floor_balance integer;
  next_schedule text;
begin
  -- Browser calls are limited to administrators. Service-role cron calls have
  -- no auth.uid() and are allowed to run the due-date check.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')
  ) then
    raise exception 'Only administrators can run point expiry';
  end if;
  select value into cfg from public.system_settings where key = 'points_expiry_config';
  cfg := coalesce(cfg, '{"enabled":false}'::jsonb);
  if not coalesce((cfg->>'enabled')::boolean, false) and not p_force then
    return jsonb_build_object('status', 'disabled', 'affected_users', 0);
  end if;

  next_schedule := coalesce(cfg->>'schedule', 'quarterly');
  if next_schedule = 'manual' and not p_force then
    return jsonb_build_object('status', 'manual', 'affected_users', 0);
  end if;
  interval_due := case next_schedule when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '3 months' end;
  select nullif(value #>> '{}', '')::timestamptz into last_run from public.system_settings where key = 'last_points_expiry_at';
  if not p_force and last_run is not null and now() < last_run + interval_due then
    return jsonb_build_object('status', 'not_due', 'affected_users', 0, 'next_run_at', last_run + interval_due);
  end if;

  retained := greatest(0, least(100, coalesce((cfg->>'retention_percent')::numeric, 0)));
  floor_balance := greatest(0, coalesce((cfg->>'minimum_balance')::integer, 0));
  perform set_config('app.wallet_activity_type', 'points_expiry', true);
  perform set_config('app.wallet_activity_description', 'Scheduled point expiry', true);
  with changed as (
    update public.profiles
    set points = greatest(floor_balance, floor(coalesce(points, 0) * retained / 100.0)::integer)
    where coalesce(points, 0) > greatest(floor_balance, floor(coalesce(points, 0) * retained / 100.0)::integer)
    returning id
  ) select count(*) into affected from changed;
  insert into public.system_settings (key, value, updated_at)
  values ('last_points_expiry_at', to_jsonb(now()::text), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return jsonb_build_object('status', 'expired', 'affected_users', affected, 'retention_percent', retained, 'minimum_balance', floor_balance, 'expired_at', now());
end;
$$;

revoke all on function public.expire_points_by_policy(boolean) from public;
grant execute on function public.expire_points_by_policy(boolean) to authenticated;
