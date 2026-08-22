-- Fast recent-history queries for a two-player conversation. The client reads
-- the newest page first, then reverses it for chronological display.
create index if not exists direct_messages_sender_receiver_created_idx
  on public.direct_messages (sender_id, receiver_id, created_at desc);

create index if not exists direct_messages_receiver_sender_created_idx
  on public.direct_messages (receiver_id, sender_id, created_at desc);

-- The chat hub resolves friendships for the signed-in player by either side of
-- the relationship. These narrow indexes avoid scanning unrelated networks.
create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status);

create index if not exists friendships_receiver_status_idx
  on public.friendships (receiver_id, status);

-- Membership lookup is by user, while the primary key begins with group_id.
create index if not exists chat_group_members_user_group_idx
  on public.chat_group_members (user_id, group_id);
