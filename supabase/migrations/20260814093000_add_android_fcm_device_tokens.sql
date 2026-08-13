-- Android FCM registration tokens are owned by the signed-in user and are
-- never readable by other players. Delivery is performed only by the Edge
-- Function with the service-role key.
create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android')),
  token text not null unique check (char_length(token) between 20 and 4096),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_device_tokens_active_idx
  on public.push_device_tokens (platform, user_id)
  where enabled;

alter table public.push_device_tokens enable row level security;

drop policy if exists "users read their own push devices" on public.push_device_tokens;
create policy "users read their own push devices"
  on public.push_device_tokens for select to authenticated
  using (user_id = auth.uid());

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
  if p_platform <> 'android' then
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

create or replace function public.disable_my_push_device(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_device_tokens
  set enabled = false, updated_at = now()
  where user_id = auth.uid() and token = trim(coalesce(p_token, ''));
$$;

revoke all on public.push_device_tokens from anon, authenticated;
grant select on public.push_device_tokens to authenticated;
grant all on public.push_device_tokens to service_role;
grant execute on function public.upsert_my_push_device(text, text) to authenticated;
grant execute on function public.disable_my_push_device(text) to authenticated;
