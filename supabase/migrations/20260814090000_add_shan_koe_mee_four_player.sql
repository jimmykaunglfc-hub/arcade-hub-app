-- Shan Koe Mee is a free four-player social table. It uses the existing room,
-- seat, invitation, bot-fill, heartbeat, and 30-second reconnection systems.
insert into public.games (title, description, category, entry_fee, status, catalog_label, display_weight)
select 'Shan Koe Mee', 'Traditional Myanmar four-player card table.', 'Card', 0, 'active', 'new', 95
where not exists (select 1 from public.games where lower(title) = 'shan koe mee');

create or replace function public.create_four_player_host_room(p_game_key text, p_name text, p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_room public.matchmaking_rooms; v_key text := lower(trim(coalesce(p_game_key, ''))); v_code text;
begin
  if auth.uid() is null then raise exception 'Sign in to host a room'; end if;
  if v_key not in ('monopoly', 'big-two', 'ludo', 'shan-koe-mee') then raise exception 'Unsupported four-player game'; end if;
  select * into v_room from public.matchmaking_rooms where game_key = v_key and host_id = auth.uid() and max_players = 4 and status = 'waiting' and expires_at > now() order by created_at desc limit 1 for update;
  if v_room.id is null then
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into public.matchmaking_rooms(game_key, room_code, max_players, host_id, fill_bots, expires_at, status) values (v_key, v_code, 4, auth.uid(), false, now() + interval '24 hours', 'waiting') returning * into v_room;
  end if;
  insert into public.matchmaking_room_players(room_id, user_id, seat, display_name, avatar_url, ready) values (v_room.id, auth.uid(), 1, coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, true)
  on conflict (room_id, user_id) do update set left_at = null, connected_at = now(), ready = true, display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return jsonb_build_object('room_id', v_room.id, 'room_code', v_room.room_code, 'game_key', v_key, 'seat', 1);
end;
$$;

create or replace function public.fund_four_player_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_game_key text; v_is_bot boolean; v_entry_fee integer; v_points integer;
begin
  if auth.uid() is null then raise exception 'Sign in to enter this match'; end if;
  select r.game_key, p.is_bot into v_game_key, v_is_bot
  from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id = r.id
  where r.id = p_room_id and p.user_id = auth.uid() and p.left_at is null for update of r, p;
  if not found or coalesce(v_is_bot, false) then raise exception 'Only a human player in this room can fund it'; end if;
  if v_game_key = 'shan-koe-mee' then return jsonb_build_object('funded', true, 'entry_points', 0, 'free_table', true); end if;
  if v_game_key = 'monopoly' then return public.fund_monopoly_room(p_room_id); end if;
  if v_game_key not in ('big-two', 'ludo') then raise exception 'This is not a supported four-player room'; end if;
  if exists (select 1 from public.four_player_match_escrow where room_id = p_room_id and user_id = auth.uid()) then return jsonb_build_object('funded', true, 'already_funded', true); end if;
  select coalesce(g.entry_fee, 0)::integer into v_entry_fee from public.games g where lower(g.title) = case v_game_key when 'big-two' then 'big two' else v_game_key end limit 1;
  v_entry_fee := greatest(coalesce(v_entry_fee, 0), 0);
  select coalesce(points, 0) into v_points from public.profiles where id = auth.uid() for update;
  if v_points < v_entry_fee then raise exception 'INSUFFICIENT_POINTS'; end if;
  update public.profiles set points = coalesce(points, 0) - v_entry_fee where id = auth.uid();
  insert into public.four_player_match_escrow(room_id, user_id, entry_points) values (p_room_id, auth.uid(), v_entry_fee);
  return jsonb_build_object('funded', true, 'entry_points', v_entry_fee);
end;
$$;

create or replace function public.join_four_player_host_room(p_room_id uuid, p_name text, p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_room public.matchmaking_rooms; v_seat smallint; v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to join a room'; end if;
  select * into v_room from public.matchmaking_rooms where id = p_room_id and max_players = 4 for update;
  if v_room.id is null or v_room.game_key not in ('monopoly', 'big-two', 'ludo', 'shan-koe-mee') then raise exception 'Four-player room not found'; end if;
  if v_room.status <> 'waiting' then raise exception 'This room is no longer open'; end if;
  select seat into v_seat from public.matchmaking_room_players where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  if v_seat is null then
    select min(s)::smallint into v_seat from generate_series(1, 4) as s where not exists (select 1 from public.matchmaking_room_players p where p.room_id = p_room_id and p.seat = s and p.left_at is null);
    if v_seat is null then raise exception 'This room is full'; end if;
    insert into public.matchmaking_room_players(room_id, user_id, seat, display_name, avatar_url, ready) values (p_room_id, auth.uid(), v_seat, coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, false);
  else
    update public.matchmaking_room_players set ready = false, connected_at = now(), last_seen_at = now(), display_name = coalesce(nullif(trim(p_name), ''), display_name), avatar_url = coalesce(p_avatar_url, avatar_url) where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  end if;
  select count(*) into v_count from public.matchmaking_room_players where room_id = p_room_id and left_at is null;
  return jsonb_build_object('room_id', p_room_id, 'room_code', v_room.room_code, 'game_key', v_room.game_key, 'seat', v_seat, 'ready_players', v_count);
end;
$$;

create or replace function public.start_four_player_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_host uuid; v_count integer; v_status text;
begin
  select host_id, status into v_host, v_status from public.matchmaking_rooms where id = p_room_id for update;
  select count(*) into v_count from public.matchmaking_room_players where room_id = p_room_id and left_at is null;
  if v_host is distinct from auth.uid() or v_count <> 4 or v_status <> 'starting' then raise exception 'Only the host may start a ready four-player room'; end if;
  update public.matchmaking_rooms set status = 'playing' where id = p_room_id;
  if (select game_key from public.matchmaking_rooms where id = p_room_id) = 'ludo' then
    insert into public.ludo_match_state(room_id,state,current_seat,turn_deadline,status) values (p_room_id, jsonb_build_object('tokens', jsonb_build_array(jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1)), 'dice', null, 'winner_seat', null), 1, now()+interval '30 seconds', 'playing') on conflict(room_id) do update set state=excluded.state,current_seat=1,turn_deadline=excluded.turn_deadline,status='playing',updated_at=now();
  end if;
  return jsonb_build_object('room_id', p_room_id, 'started', true);
end;
$$;

revoke all on function public.create_four_player_host_room(text,text,text), public.fund_four_player_room(uuid), public.join_four_player_host_room(uuid,text,text), public.start_four_player_room(uuid) from public;
grant execute on function public.create_four_player_host_room(text,text,text), public.fund_four_player_room(uuid), public.join_four_player_host_room(uuid,text,text), public.start_four_player_room(uuid) to authenticated;
notify pgrst, 'reload schema';
