-- A friendship is an undirected relationship. Older data allowed one request
-- in each direction, which made the same person appear twice in Direct chat.
-- Keep one best record per pair before making that invariant permanent.
with ranked_friendships as (
  select
    id,
    row_number() over (
      partition by least(requester_id, receiver_id), greatest(requester_id, receiver_id)
      order by
        case status when 'accepted' then 0 when 'pending' then 1 else 2 end,
        created_at asc,
        id asc
    ) as row_number
  from public.friendships
)
delete from public.friendships
where id in (select id from ranked_friendships where row_number > 1);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (least(requester_id, receiver_id), greatest(requester_id, receiver_id));

create or replace function public.request_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  existing public.friendships;
begin
  if auth.uid() is null or target_user_id = auth.uid() then
    raise exception 'Invalid friend request';
  end if;

  select * into existing
  from public.friendships
  where (requester_id = auth.uid() and receiver_id = target_user_id)
     or (requester_id = target_user_id and receiver_id = auth.uid())
  for update;

  if found then
    if existing.status = 'accepted' then
      raise exception 'You are already friends';
    end if;
    if existing.status = 'pending' and existing.requester_id <> auth.uid() then
      raise exception 'This player has already invited you; accept or decline the pending request';
    end if;
    if existing.status = 'pending' then
      raise exception 'Friend request already sent';
    end if;

    update public.friendships
    set requester_id = auth.uid(), receiver_id = target_user_id, status = 'pending', created_at = timezone('utc', now())
    where id = existing.id;
    return;
  end if;

  insert into public.friendships(requester_id, receiver_id, status)
  values(auth.uid(), target_user_id, 'pending');
end;
$$;

create or replace function public.respond_to_friend_request(request_id uuid, accepted boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.friendships
  set status = case when accepted then 'accepted' else 'declined' end
  where id = request_id and receiver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Friend request not found'; end if;
end;
$$;

revoke all on function public.request_friend(uuid) from public;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
