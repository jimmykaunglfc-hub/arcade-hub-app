-- Bingo queue hygiene: never reuse an old bot room and never insert a bot
-- before the full 45-second human-search period has elapsed.

create or replace function public.queue_bingo_match(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_seat smallint; v_opponent text; v_bot boolean; v_code text;
begin
  -- Resume only a room made by this same search attempt.  Old rooms from a
  -- previous exit are deliberately ignored instead of showing an instant bot.
  select r.* into v_room
  from public.matchmaking_rooms r
  join public.matchmaking_room_players p on p.room_id=r.id
  where r.game_key='bingo' and r.max_players=2 and r.status in ('waiting','playing')
    and r.created_at >= now()-interval '55 seconds'
    and p.user_id=auth.uid() and p.left_at is null
  order by r.created_at desc limit 1;
  if v_room.id is not null then
    select seat into v_seat from public.matchmaking_room_players where room_id=v_room.id and user_id=auth.uid() and left_at is null;
    select display_name,is_bot into v_opponent,v_bot from public.matchmaking_room_players where room_id=v_room.id and seat<>v_seat and left_at is null limit 1;
    return jsonb_build_object('room_id',v_room.id,'seat',v_seat,'matched',v_room.status='playing','opponent_name',v_opponent,'is_bot',coalesce(v_bot,false));
  end if;

  -- A real, waiting player is the only possible immediate match.
  select r.* into v_room from public.matchmaking_rooms r
  where r.game_key='bingo' and r.max_players=2 and r.status='waiting'
    and r.created_at >= now()-interval '45 seconds'
    and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.left_at is null and not p.is_bot and p.user_id is distinct from auth.uid())
  order by r.created_at limit 1 for update skip locked;
  if v_room.id is not null then
    insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready)
    values(v_room.id,auth.uid(),2,coalesce(nullif(p_name,''),'Online Player'),true);
    perform public.initialize_bingo_match(v_room.id);
    select display_name into v_opponent from public.matchmaking_room_players where room_id=v_room.id and seat=1;
    return jsonb_build_object('room_id',v_room.id,'seat',2,'matched',true,'opponent_name',v_opponent,'is_bot',false);
  end if;

  v_code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at)
  values('bingo',v_code,2,auth.uid(),true,now()+interval '24 hours') returning * into v_room;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready)
  values(v_room.id,auth.uid(),1,coalesce(nullif(p_name,''),'Online Player'),true);
  insert into public.two_player_game_state(room_id,game_key,state,status)
  values(v_room.id,'bingo','{}'::jsonb,'waiting');
  return jsonb_build_object('room_id',v_room.id,'seat',1,'matched',false);
end $$;

create or replace function public.fill_bingo_match_with_bot(p_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_name text;
begin
  select r.* into v_room from public.matchmaking_rooms r
  join public.matchmaking_room_players p on p.room_id=r.id
  where r.game_key='bingo' and r.max_players=2 and r.status='waiting'
    and r.created_at <= now()-interval '45 seconds'
    and p.user_id=auth.uid() and p.left_at is null
  order by r.created_at desc limit 1 for update;
  if v_room.id is null then raise exception 'The 45-second Bingo player search is still active'; end if;
  v_name := (array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready)
  values(v_room.id,2,v_name,true,true);
  perform public.initialize_bingo_match(v_room.id);
  return jsonb_build_object('room_id',v_room.id,'seat',1,'opponent_name',v_name);
end $$;

create or replace function public.leave_bingo_match(p_room_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  update public.matchmaking_room_players set left_at=now(), last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  update public.matchmaking_rooms set status='cancelled' where id=p_room_id and game_key='bingo' and status in ('waiting','playing');
  update public.two_player_game_state set status='completed',updated_at=now()
  where room_id=p_room_id and game_key='bingo' and status in ('waiting','playing');
end $$;

grant execute on function public.queue_bingo_match(text) to authenticated;
grant execute on function public.fill_bingo_match_with_bot(text) to authenticated;
grant execute on function public.leave_bingo_match(uuid) to authenticated;
