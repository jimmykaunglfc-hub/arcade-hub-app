-- Engagement campaigns, in-app broadcast presentation, and reliable auth profile provisioning.

alter table public.push_broadcasts
  add column if not exists action_label text,
  add column if not exists show_in_app_dialog boolean not null default true;

create table if not exists public.splash_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  message text not null default '' check (char_length(message) <= 240),
  image_url text,
  action_label text,
  action_url text,
  display_seconds integer not null default 5 check (display_seconds between 0 and 30),
  show_every_launch boolean not null default false,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists splash_campaigns_active_window_idx
  on public.splash_campaigns (is_active, starts_at, ends_at, created_at desc);

alter table public.splash_campaigns enable row level security;
drop policy if exists "public reads active splash campaigns" on public.splash_campaigns;
create policy "public reads active splash campaigns"
  on public.splash_campaigns for select
  to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
drop policy if exists "admins manage splash campaigns" on public.splash_campaigns;
create policy "admins manage splash campaigns"
  on public.splash_campaigns for all
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'))
  with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'preferred_username', new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'player'), '@', 1), 'player'), '[^a-zA-Z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);
  if char_length(base_username) < 3 then base_username := 'player'; end if;

  insert into public.profiles (id, email, username, avatar_url)
  values (new.id, new.email, left(base_username, 20) || '_' || substr(new.id::text, 1, 6), coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'))
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.ensure_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account auth.users;
  base_username text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into account from auth.users where id = auth.uid();
  if not found then raise exception 'Authenticated account not found'; end if;

  base_username := lower(regexp_replace(coalesce(account.raw_user_meta_data ->> 'preferred_username', account.raw_user_meta_data ->> 'user_name', account.raw_user_meta_data ->> 'name', split_part(coalesce(account.email, 'player'), '@', 1), 'player'), '[^a-zA-Z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);
  if char_length(base_username) < 3 then base_username := 'player'; end if;

  insert into public.profiles (id, email, username, avatar_url)
  values (account.id, account.email, left(base_username, 20) || '_' || substr(account.id::text, 1, 6), coalesce(account.raw_user_meta_data ->> 'avatar_url', account.raw_user_meta_data ->> 'picture'))
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
end;
$$;

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;

insert into public.profiles (id, email, username, avatar_url)
select
  u.id,
  u.email,
  left(coalesce(nullif(trim(both '_' from lower(regexp_replace(coalesce(u.raw_user_meta_data ->> 'user_name', u.raw_user_meta_data ->> 'name', split_part(coalesce(u.email, 'player'), '@', 1)), '[^a-zA-Z0-9_]+', '_', 'g'))), ''), 'player'), 20) || '_' || substr(u.id::text, 1, 6),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

