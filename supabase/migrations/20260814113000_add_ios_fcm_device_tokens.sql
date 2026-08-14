-- iOS uses Firebase Messaging registration tokens (not raw APNs tokens), so
-- Android and iOS can share the same secure FCM delivery endpoint.
alter table public.push_device_tokens
  drop constraint if exists push_device_tokens_platform_check;

alter table public.push_device_tokens
  add constraint push_device_tokens_platform_check
  check (platform in ('android', 'ios'));

create or replace function public.upsert_my_push_device(
  p_token text,
  p_platform text default 'android'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Unsupported notification platform';
  end if;
  if char_length(trim(coalesce(p_token, ''))) not between 20 and 4096 then
    raise exception 'Invalid push token';
  end if;

  insert into public.push_device_tokens (user_id, platform, token, enabled, updated_at, last_seen_at)
  values (auth.uid(), p_platform, trim(p_token), true, now(), now())
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      enabled = true,
      updated_at = now(),
      last_seen_at = now();
end;
$$;
