create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_group_messages_group_created_idx on public.chat_group_messages(group_id, created_at);
alter table public.chat_group_messages enable row level security;
create policy "members read group messages" on public.chat_group_messages for select to authenticated using (exists (select 1 from public.chat_group_members m where m.group_id = chat_group_messages.group_id and m.user_id = auth.uid()));
create policy "members send group messages" on public.chat_group_messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.chat_group_members m where m.group_id = chat_group_messages.group_id and m.user_id = auth.uid()));
