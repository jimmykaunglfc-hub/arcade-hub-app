-- Reliable chat invitations, groups, and in-app notifications.
alter table public.profiles add column if not exists last_seen_at timestamptz not null default now();
alter table public.friendships alter column status set default 'pending';

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
drop policy if exists "public groups visible" on public.chat_groups;
drop policy if exists "users create groups" on public.chat_groups;
drop policy if exists "members visible" on public.chat_group_members;
drop policy if exists "users join public groups" on public.chat_group_members;
create policy "public groups visible" on public.chat_groups for select to authenticated using (is_public or created_by = auth.uid());
create policy "users create groups" on public.chat_groups for insert to authenticated with check (created_by = auth.uid());
create policy "members visible" on public.chat_group_members for select to authenticated using (true);
create policy "users join public groups" on public.chat_group_members for insert to authenticated with check (
  user_id = auth.uid() and (
    (role = 'member' and exists (select 1 from public.chat_groups g where g.id = group_id and g.is_public))
    or (role = 'owner' and exists (select 1 from public.chat_groups g where g.id = group_id and g.created_by = auth.uid()))
  )
);

alter table public.direct_messages add column if not exists read_at timestamptz;
create index if not exists direct_messages_receiver_unread_idx on public.direct_messages (receiver_id, created_at desc) where read_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain'])
on conflict (id) do nothing;
drop policy if exists "chat attachments are readable" on storage.objects;
drop policy if exists "users upload chat attachments" on storage.objects;
drop policy if exists "users remove their chat attachments" on storage.objects;
create policy "chat attachments are readable" on storage.objects for select to authenticated using (bucket_id = 'chat-attachments');
create policy "users upload chat attachments" on storage.objects for insert to authenticated with check (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users remove their chat attachments" on storage.objects for delete to authenticated using (bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.touch_chat_presence() returns void language sql security definer set search_path=public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
grant execute on function public.touch_chat_presence() to authenticated;

create or replace function public.request_friend(target_user_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or target_user_id = auth.uid() then raise exception 'Invalid friend request'; end if;
  insert into public.friendships(requester_id, receiver_id, status)
  values(auth.uid(), target_user_id, 'pending')
  on conflict (requester_id, receiver_id) do update set status = case when public.friendships.status = 'declined' then 'pending' else public.friendships.status end;
end; $$;
grant execute on function public.request_friend(uuid) to authenticated;

create or replace function public.respond_to_friend_request(request_id uuid, accepted boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.friendships set status = case when accepted then 'accepted' else 'declined' end
  where id = request_id and receiver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Friend request not found'; end if;
end; $$;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

create or replace function public.notify_chat_activity() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name = 'direct_messages' then
    insert into public.user_notifications(user_id,title,message,kind,category)
    values(new.receiver_id, case when new.message_type = 'game_invite' then 'Game challenge received' else 'New message' end, coalesce(new.content, 'You have a new message'), 'chat', 'general');
  elsif tg_table_name = 'friendships' and new.status = 'pending' then
    insert into public.user_notifications(user_id,title,message,kind,category)
    values(new.receiver_id, 'Friend request', 'You have a new connection request.', 'friend_request', 'general');
  end if;
  return new;
end; $$;
drop trigger if exists direct_message_notification on public.direct_messages;
create trigger direct_message_notification after insert on public.direct_messages for each row execute function public.notify_chat_activity();
drop trigger if exists friendship_notification on public.friendships;
create trigger friendship_notification after insert or update of status on public.friendships for each row execute function public.notify_chat_activity();
