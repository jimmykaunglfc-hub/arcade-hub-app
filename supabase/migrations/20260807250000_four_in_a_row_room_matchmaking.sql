-- Authoritative room matchmaking and bot fallback for Four in a Row.

create or replace function public.four_in_a_row_empty_board()
returns jsonb language sql immutable as $$
  select '[[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null]]'::jsonb
$$;

create or replace function public.four_in_a_row_open_row(p_board jsonb, p_column integer)
returns integer language plpgsql immutable as $$
declare r integer;
begin
  -- In PL/pgSQL REVERSE requires descending bounds. `REVERSE 0..5`
  -- executes zero iterations, which made every column look full.
  for r in reverse 5..0 loop
    if p_board->r->>p_column is null then return r; end if;
  end loop;
  return -1;
end $$;

create or replace function public.four_in_a_row_apply(p_board jsonb, p_column integer, p_seat integer)
returns jsonb language plpgsql immutable as $$
declare r integer;
begin
  r := public.four_in_a_row_open_row(p_board,p_column);
  if r < 0 then return p_board; end if;
  return jsonb_set(p_board,array[r::text,p_column::text],to_jsonb(p_seat),true);
end $$;

create or replace function public.four_in_a_row_has_four(p_board jsonb, p_seat integer)
returns boolean language plpgsql immutable as $$
declare r integer; c integer; i integer; nr integer; nc integer; v_count integer; v_direction integer[];
begin
  for r in 0..5 loop for c in 0..6 loop
    if p_board->r->>c <> p_seat::text then continue; end if;
    foreach v_direction slice 1 in array array[[0,1],[1,0],[1,1],[1,-1]] loop
      v_count:=1;
      for i in 1..3 loop
        nr:=r+v_direction[1]*i; nc:=c+v_direction[2]*i;
        if nr between 0 and 5 and nc between 0 and 6 and p_board->nr->>nc=p_seat::text then v_count:=v_count+1; else exit; end if;
      end loop;
      if v_count=4 then return true; end if;
    end loop;
  end loop; end loop;
  return false;
end $$;

create or replace function public.create_four_in_a_row_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then raise exception 'Not a room player'; end if;
  update public.two_player_game_state set state=jsonb_build_object('board',public.four_in_a_row_empty_board(),'winner_seat',null,'draw',false),current_seat=1,version=version+1,updated_at=now()
  where room_id=p_room_id and game_key='four-in-a-row';
  return jsonb_build_object('room_id',p_room_id);
end $$;

create or replace function public.start_four_in_a_row_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_players integer;
begin
  select count(*) into v_players from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
  if v_players <> 2 then raise exception 'Four in a Row needs two players'; end if;
  update public.two_player_game_state set state=jsonb_build_object('board',public.four_in_a_row_empty_board(),'winner_seat',null,'draw',false),current_seat=1,version=version+1,status='playing',updated_at=now() where room_id=p_room_id and game_key='four-in-a-row';
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'started',true);
end $$;

create or replace function public.queue_four_in_a_row_match(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_seat smallint; v_name text; v_bot boolean; v_code text;
begin
  select r.* into v_room from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id=r.id
  where r.game_key='four-in-a-row' and r.max_players=2 and r.status in ('waiting','playing') and r.created_at>=now()-interval '55 seconds' and p.user_id=auth.uid() and p.left_at is null order by r.created_at desc limit 1;
  if v_room.id is not null then
    select seat into v_seat from public.matchmaking_room_players where room_id=v_room.id and user_id=auth.uid() and left_at is null;
    select display_name,is_bot into v_name,v_bot from public.matchmaking_room_players where room_id=v_room.id and seat<>v_seat and left_at is null limit 1;
    return jsonb_build_object('room_id',v_room.id,'seat',v_seat,'matched',v_room.status='playing','opponent_name',v_name,'is_bot',coalesce(v_bot,false));
  end if;
  select r.* into v_room from public.matchmaking_rooms r where r.game_key='four-in-a-row' and r.max_players=2 and r.status='waiting' and r.created_at>=now()-interval '45 seconds' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.left_at is null and not p.is_bot and p.user_id is distinct from auth.uid()) order by r.created_at limit 1 for update skip locked;
  if v_room.id is not null then
    insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),2,coalesce(nullif(p_name,''),'Online Player'),true);
    perform public.start_four_in_a_row_match(v_room.id);
    select display_name into v_name from public.matchmaking_room_players where room_id=v_room.id and seat=1;
    return jsonb_build_object('room_id',v_room.id,'seat',2,'matched',true,'opponent_name',v_name,'is_bot',false);
  end if;
  v_code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at) values('four-in-a-row',v_code,2,auth.uid(),true,now()+interval '24 hours') returning * into v_room;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),1,coalesce(nullif(p_name,''),'Online Player'),true);
  insert into public.two_player_game_state(room_id,game_key,state,status) values(v_room.id,'four-in-a-row',jsonb_build_object('board',public.four_in_a_row_empty_board(),'winner_seat',null,'draw',false),'waiting');
  return jsonb_build_object('room_id',v_room.id,'seat',1,'matched',false);
end $$;

create or replace function public.fill_four_in_a_row_match_with_bot(p_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_name text;
begin
  select r.* into v_room from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id=r.id where r.game_key='four-in-a-row' and r.status='waiting' and r.created_at<=now()-interval '45 seconds' and p.user_id=auth.uid() and p.left_at is null order by r.created_at desc limit 1 for update;
  if v_room.id is null then raise exception 'The 45-second player search is still active'; end if;
  v_name:=(array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(v_room.id,2,v_name,true,true);
  perform public.start_four_in_a_row_match(v_room.id);
  return jsonb_build_object('room_id',v_room.id,'seat',1,'opponent_name',v_name);
end $$;

create or replace function public.cancel_four_in_a_row_matchmaking()
returns void language plpgsql security definer set search_path=public as $$
begin update public.matchmaking_rooms r set status='cancelled' where r.game_key='four-in-a-row' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null); end $$;

create or replace function public.four_in_a_row_move(p_room_id uuid,p_column integer,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint; v_board jsonb; v_row integer; v_win boolean; v_draw boolean;
begin
  if p_column not between 0 and 6 then raise exception 'Invalid column'; end if;
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='four-in-a-row' for update;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.status<>'playing' or v_seat is null or v_state.current_seat<>v_seat then raise exception 'Not your turn'; end if;
  v_board:=v_state.state->'board'; v_row:=public.four_in_a_row_open_row(v_board,p_column); if v_row<0 then raise exception 'Column is full'; end if;
  v_board:=public.four_in_a_row_apply(v_board,p_column,v_seat); v_win:=public.four_in_a_row_has_four(v_board,v_seat); v_draw:=not exists(select 1 from generate_series(0,6) c where public.four_in_a_row_open_row(v_board,c)>=0);
  update public.two_player_game_state set state=jsonb_build_object('board',v_board,'winner_seat',case when v_win then v_seat else null end,'draw',v_draw),current_seat=case when v_win or v_draw then v_seat else case when v_seat=1 then 2 else 1 end end,version=version+1,status=case when v_win or v_draw then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
  if v_win or v_draw then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('row',v_row,'version',v_state.version+1);
end $$;

create or replace function public.resolve_four_in_a_row_bot_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_bot boolean; v_board jsonb; v_seat integer; v_other integer; v_col integer := null; v_test jsonb; v_win boolean; v_draw boolean;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='four-in-a-row' for update;
  if v_state.status<>'playing' then return jsonb_build_object('moved',false); end if;
  v_seat:=v_state.current_seat;
  select is_bot into v_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_seat and left_at is null;
  if not coalesce(v_bot,false) then return jsonb_build_object('moved',false); end if;
  v_board:=v_state.state->'board'; v_other:=case when v_seat=1 then 2 else 1 end;
  foreach v_col in array array[3,2,4,1,5,0,6] loop if public.four_in_a_row_open_row(v_board,v_col)>=0 and public.four_in_a_row_has_four(public.four_in_a_row_apply(v_board,v_col,v_seat),v_seat) then exit; else v_col:=null; end if; end loop;
  if v_col is null then foreach v_col in array array[3,2,4,1,5,0,6] loop if public.four_in_a_row_open_row(v_board,v_col)>=0 and public.four_in_a_row_has_four(public.four_in_a_row_apply(v_board,v_col,v_other),v_other) then exit; else v_col:=null; end if; end loop; end if;
  if v_col is null then select c into v_col from unnest(array[3,2,4,1,5,0,6]) c where public.four_in_a_row_open_row(v_board,c)>=0 limit 1; end if;
  if v_col is null then return jsonb_build_object('moved',false); end if;
  v_board:=public.four_in_a_row_apply(v_board,v_col,v_seat); v_win:=public.four_in_a_row_has_four(v_board,v_seat); v_draw:=not exists(select 1 from generate_series(0,6) c where public.four_in_a_row_open_row(v_board,c)>=0);
  update public.two_player_game_state set state=jsonb_build_object('board',v_board,'winner_seat',case when v_win then v_seat else null end,'draw',v_draw),current_seat=case when v_win or v_draw then v_seat else case when v_seat=1 then 2 else 1 end end,version=version+1,status=case when v_win or v_draw then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
  if v_win or v_draw then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('moved',true,'column',v_col);
end $$;

grant execute on function public.create_four_in_a_row_state(uuid) to authenticated;
grant execute on function public.start_four_in_a_row_match(uuid) to authenticated;
grant execute on function public.queue_four_in_a_row_match(text) to authenticated;
grant execute on function public.fill_four_in_a_row_match_with_bot(text) to authenticated;
grant execute on function public.cancel_four_in_a_row_matchmaking() to authenticated;
grant execute on function public.four_in_a_row_move(uuid,integer,integer) to authenticated;
grant execute on function public.resolve_four_in_a_row_bot_turn(uuid) to authenticated;
