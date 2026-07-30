create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all' check (audience in ('all', 'ranked', 'vip')),
  category text not null default 'general' check (category in ('general', 'system', 'promotion')),
  action_url text,
  recipients_count integer not null default 0,
  status text not null default 'delivered',
  created_at timestamptz not null default now()
);
create index if not exists push_broadcasts_created_idx on public.push_broadcasts(created_at desc);
alter table public.push_broadcasts enable row level security;
drop policy if exists "authenticated read broadcasts" on public.push_broadcasts;
create policy "authenticated read broadcasts" on public.push_broadcasts for select to authenticated using (true);
drop policy if exists "admins manage broadcasts" on public.push_broadcasts;
create policy "admins manage broadcasts" on public.push_broadcasts for all to authenticated using ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')) with check ((select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

alter table public.user_notifications add column if not exists category text not null default 'general' check (category in ('general', 'system', 'promotion'));

create or replace function public.create_wallet_activity_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.user_notifications(user_id, title, message, kind, category)
  values (
    new.user_id,
    case when new.amount >= 0 then 'Wallet credited' else 'Wallet debited' end,
    coalesce(new.description, 'Wallet activity') || ': ' || case when new.amount >= 0 then '+' else '' end || new.amount || ' ' || upper(new.currency_type),
    'wallet_activity',
    'system'
  );
  return new;
end;
$$;
drop trigger if exists wallet_activity_notification on public.wallet_activity_logs;
create trigger wallet_activity_notification after insert on public.wallet_activity_logs for each row execute function public.create_wallet_activity_notification();
notify pgrst, 'reload schema';
