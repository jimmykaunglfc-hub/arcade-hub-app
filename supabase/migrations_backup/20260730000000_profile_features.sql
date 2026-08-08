-- Profile, account-support, and in-app notification features.
-- Apply this migration through the project's Supabase migration workflow before
-- releasing the corresponding client UI.

alter table public.profiles
  add column if not exists name_change_count integer not null default 0,
  add column if not exists avatar_change_count integer not null default 0,
  add column if not exists push_enabled boolean not null default false;

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('email_change', 'account_deletion', 'other')),
  details text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_documents (
  slug text primary key check (slug in ('privacy-policy', 'terms-of-service')),
  title text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null default 'system',
  action_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);
create index if not exists account_requests_status_created_idx
  on public.account_requests (status, created_at desc);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "users upload their avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars are publicly readable" on storage.objects for select to public using (bucket_id = 'avatars');
create policy "users update their avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Atomic, server-enforced identity update. The client cannot alter the cost or
-- decrement its own balance directly.
create or replace function public.update_profile_identity(
  new_username text default null,
  new_avatar_url text default null,
  name_change_cost integer default 100,
  avatar_change_cost integer default 150
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles;
  charge integer := 0;
begin
  select * into current_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;

  if new_username is not null and btrim(new_username) <> '' and btrim(new_username) <> current_profile.username then
    charge := charge + case when current_profile.name_change_count = 0 then 0 else greatest(name_change_cost, 0) end;
  else
    new_username := current_profile.username;
  end if;

  if new_avatar_url is not null and btrim(new_avatar_url) <> '' and btrim(new_avatar_url) <> coalesce(current_profile.avatar_url, '') then
    charge := charge + case when current_profile.avatar_change_count = 0 then 0 else greatest(avatar_change_cost, 0) end;
  else
    new_avatar_url := current_profile.avatar_url;
  end if;

  if coalesce(current_profile.points, 0) < charge then raise exception 'Insufficient points'; end if;

  update public.profiles
  set username = new_username,
      avatar_url = new_avatar_url,
      points = coalesce(points, 0) - charge,
      name_change_count = name_change_count + case when new_username <> current_profile.username then 1 else 0 end,
      avatar_change_count = avatar_change_count + case when new_avatar_url <> coalesce(current_profile.avatar_url, '') then 1 else 0 end
  where id = auth.uid()
  returning * into current_profile;

  if charge > 0 then
    insert into public.financial_audit_logs (user_id, amount, balance_snapshot, mutation_type, description)
    values (auth.uid(), -charge, current_profile.points, 'profile_update', 'Profile identity update');
  end if;

  return current_profile;
end;
$$;

revoke all on function public.update_profile_identity(text, text, integer, integer) from public;
grant execute on function public.update_profile_identity(text, text, integer, integer) to authenticated;

-- Deliberately limited social profile card: this is the only public path for
-- player balances, cosmetic totals, and recent point movement.
create or replace function public.get_public_profile_card(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.profiles; result jsonb;
begin
  select * into target from public.profiles where lower(username) = lower(btrim(target_username)) limit 1;
  if not found then return null; end if;
  select jsonb_build_object(
    'id', target.id, 'username', target.username, 'avatar_url', target.avatar_url,
    'points', coalesce(target.points, 0), 'gems', coalesce(target.gems, 0),
    'cosmetics_purchased', (select count(*) from public.user_inventory where user_id = target.id),
    'point_history', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'description', description, 'created_at', created_at) order by created_at desc) from (select amount, description, created_at from public.financial_audit_logs where user_id = target.id order by created_at desc limit 10) ledger), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_public_profile_card(text) from public;
grant execute on function public.get_public_profile_card(text) to authenticated;

alter table public.account_requests enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_faqs enable row level security;
alter table public.legal_documents enable row level security;
alter table public.user_notifications enable row level security;

create policy "users read their account requests" on public.account_requests for select to authenticated using (user_id = auth.uid());
create policy "users create their account requests" on public.account_requests for insert to authenticated with check (user_id = auth.uid());
create policy "users read their support tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid());
create policy "users create support tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy "published FAQs are readable" on public.support_faqs for select to authenticated using (is_published = true);
create policy "legal documents are readable" on public.legal_documents for select to authenticated using (true);
create policy "users read their notifications" on public.user_notifications for select to authenticated using (user_id = auth.uid());
create policy "users update their notifications" on public.user_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add admin policies matching this project's existing profiles.role convention.
create policy "admins manage account requests" on public.account_requests for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
create policy "admins manage support tickets" on public.support_tickets for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
create policy "admins manage FAQs" on public.support_faqs for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
create policy "admins manage legal documents" on public.legal_documents for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
create policy "admins manage notifications" on public.user_notifications for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
