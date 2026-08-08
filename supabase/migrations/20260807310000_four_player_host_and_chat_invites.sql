-- Four-player private rooms used by Monopoly, Big Two, and Ludo.
-- A single room can be shared by a host code and up to three chat invites.

create or replace function public.create_four_player_host_room(
  p_game_key text,
  p_name text,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.matchmaking_rooms;
  v_key text := lower(trim(coalesce(p_game_key, '')));
  v_code text;
begin
  if auth.uid() is null then raise exception 'Sign in to host a room'; end if;
  if v_key not in ('monopoly', 'big-two', 'ludo') then
    raise exception 'Unsupported four-player game';
  end if;

  -- Reuse an open host room so repeated taps never create disconnected rooms.
  select * into v_room
  from public.matchmaking_rooms
  where game_key = v_key
    and host_id = auth.uid()
    and max_players = 4
    and status = 'waiting'
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if v_room.id is null then
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into public.matchmaking_rooms(
      game_key, room_code, max_players, host_id, fill_bots, expires_at, status
    ) values (
      v_key, v_code, 4, auth.uid(), false, now() + interval '24 hours', 'waiting'
    ) returning * into v_room;
  end if;

  insert into public.matchmaking_room_players(
    room_id, user_id, seat, display_name, avatar_url, ready
  ) values (
    v_room.id, auth.uid(), 1, coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, true
  )
  on conflict (room_id, user_id) do update
    set left_at = null, connected_at = now(), ready = true,
        display_name = excluded.display_name, avatar_url = excluded.avatar_url;

  return jsonb_build_object(
    'room_id', v_room.id,
    'room_code', v_room.room_code,
    'game_key', v_key,
    'seat', 1
  );
end;
$$;

create or replace function public.join_four_player_host_room(
  p_room_id uuid,
  p_name text,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.matchmaking_rooms;
  v_seat smallint;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join a room'; end if;

  select * into v_room
  from public.matchmaking_rooms
  where id = p_room_id and max_players = 4
  for update;

  if v_room.id is null or v_room.game_key not in ('monopoly', 'big-two', 'ludo') then
    raise exception 'Four-player room not found';
  end if;
  if v_room.status <> 'waiting' then raise exception 'This room is no longer open'; end if;

  select seat into v_seat
  from public.matchmaking_room_players
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  if v_seat is null then
    select min(s)::smallint into v_seat
    from generate_series(1, 4) as s
    where not exists (
      select 1 from public.matchmaking_room_players p
      where p.room_id = p_room_id and p.seat = s and p.left_at is null
    );
    if v_seat is null then raise exception 'This room is full'; end if;
    insert into public.matchmaking_room_players(
      room_id, user_id, seat, display_name, avatar_url, ready
    ) values (
      p_room_id, auth.uid(), v_seat,
      coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, true
    );
  else
    update public.matchmaking_room_players
    set ready = true, connected_at = now(), avatar_url = coalesce(p_avatar_url, avatar_url)
    where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  end if;

  select count(*) into v_count
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;

  if v_count = 4
    and (v_room.game_key <> 'monopoly' or (select count(*) from public.monopoly_match_escrow where room_id = p_room_id and status = 'held') = 4) then
    update public.matchmaking_rooms set status = 'starting' where id = p_room_id and status = 'waiting';
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'room_code', v_room.room_code,
    'game_key', v_room.game_key,
    'seat', v_seat,
    'ready_players', v_count
  );
end;
$$;

create or replace function public.join_four_player_host_room_by_code(
  p_room_code text,
  p_name text,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id
  from public.matchmaking_rooms
  where room_code = upper(trim(p_room_code))
    and max_players = 4
    and status = 'waiting'
  limit 1;
  if v_room_id is null then raise exception 'Room code not found or unavailable'; end if;
  return public.join_four_player_host_room(v_room_id, p_name, p_avatar_url);
end;
$$;

grant execute on function public.create_four_player_host_room(text, text, text) to authenticated;
grant execute on function public.join_four_player_host_room(uuid, text, text) to authenticated;
grant execute on function public.join_four_player_host_room_by_code(text, text, text) to authenticated;
