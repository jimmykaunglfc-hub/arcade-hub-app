-- Four in a Row: authoritative clock, timeout and bot progression.

alter table public.two_player_game_state
  add column if not exists turn_deadline timestamptz;

create or replace function public.start_four_in_a_row_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_players integer;
begin
  select count(*) into v_players from public.matchmaking_room_players
  where room_id=p_room_id and left_at is null;
  if v_players <> 2 then raise exception 'Four in a Row needs two players'; end if;

  update public.two_player_game_state
  set state=jsonb_build_object('board',public.four_in_a_row_empty_board(),'winner_seat',null,'draw',false),
      current_seat=1, version=version+1, status='playing',
      turn_deadline=now()+interval '30 seconds', updated_at=now()
  where room_id=p_room_id and game_key='four-in-a-row';
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'started',true);
end $$;

create or replace function public.four_in_a_row_move(p_room_id uuid,p_column integer,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint; v_board jsonb; v_row integer; v_win boolean; v_draw boolean;
begin
  if p_column not between 0 and 6 then raise exception 'Invalid column'; end if;
  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='four-in-a-row' for update;
  select seat into v_seat from public.matchmaking_room_players
  where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.room_id is null or v_seat is null then raise exception 'Not a room player'; end if;
  if v_state.status <> 'playing' then raise exception 'Game is not active'; end if;
  if v_state.current_seat <> v_seat then raise exception 'Not your turn'; end if;
  if v_state.version <> p_expected_version then raise exception 'Game changed; reload state'; end if;

  v_board:=v_state.state->'board';
  v_row:=public.four_in_a_row_open_row(v_board,p_column);
  if v_row<0 then raise exception 'Column is full'; end if;
  v_board:=public.four_in_a_row_apply(v_board,p_column,v_seat);
  v_win:=public.four_in_a_row_has_four(v_board,v_seat);
  v_draw:=not exists(select 1 from generate_series(0,6) c where public.four_in_a_row_open_row(v_board,c)>=0);

  update public.two_player_game_state
  set state=jsonb_build_object('board',v_board,'winner_seat',case when v_win then v_seat else null end,'draw',v_draw),
      current_seat=case when v_win or v_draw then v_seat else case when v_seat=1 then 2 else 1 end end,
      version=version+1, status=case when v_win or v_draw then 'completed' else 'playing' end,
      turn_deadline=case when v_win or v_draw then null else now()+interval '30 seconds' end,
      updated_at=now()
  where room_id=p_room_id;
  if v_win or v_draw then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('row',v_row,'version',v_state.version+1);
end $$;

create or replace function public.resolve_four_in_a_row_bot_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_bot boolean; v_board jsonb; v_seat integer; v_other integer; v_col integer:=null; v_win boolean; v_draw boolean;
begin
  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='four-in-a-row' for update;
  if v_state.room_id is null or v_state.status<>'playing' then return jsonb_build_object('moved',false); end if;
  v_seat:=v_state.current_seat;
  select is_bot into v_bot from public.matchmaking_room_players
  where room_id=p_room_id and seat=v_seat and left_at is null;
  if not coalesce(v_bot,false) then return jsonb_build_object('moved',false); end if;

  v_board:=v_state.state->'board'; v_other:=case when v_seat=1 then 2 else 1 end;
  foreach v_col in array array[3,2,4,1,5,0,6] loop
    if public.four_in_a_row_open_row(v_board,v_col)>=0
      and public.four_in_a_row_has_four(public.four_in_a_row_apply(v_board,v_col,v_seat),v_seat) then exit;
    else v_col:=null; end if;
  end loop;
  if v_col is null then
    foreach v_col in array array[3,2,4,1,5,0,6] loop
      if public.four_in_a_row_open_row(v_board,v_col)>=0
        and public.four_in_a_row_has_four(public.four_in_a_row_apply(v_board,v_col,v_other),v_other) then exit;
      else v_col:=null; end if;
    end loop;
  end if;
  if v_col is null then
    select c into v_col from unnest(array[3,2,4,1,5,0,6]) c
    where public.four_in_a_row_open_row(v_board,c)>=0 limit 1;
  end if;
  if v_col is null then return jsonb_build_object('moved',false); end if;

  v_board:=public.four_in_a_row_apply(v_board,v_col,v_seat);
  v_win:=public.four_in_a_row_has_four(v_board,v_seat);
  v_draw:=not exists(select 1 from generate_series(0,6) c where public.four_in_a_row_open_row(v_board,c)>=0);
  update public.two_player_game_state
  set state=jsonb_build_object('board',v_board,'winner_seat',case when v_win then v_seat else null end,'draw',v_draw),
      current_seat=case when v_win or v_draw then v_seat else case when v_seat=1 then 2 else 1 end end,
      version=version+1, status=case when v_win or v_draw then 'completed' else 'playing' end,
      turn_deadline=case when v_win or v_draw then null else now()+interval '30 seconds' end,
      updated_at=now()
  where room_id=p_room_id;
  if v_win or v_draw then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('moved',true,'column',v_col);
end $$;

create or replace function public.get_four_in_a_row_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint; v_players jsonb;
begin
  select seat into v_seat from public.matchmaking_room_players
  where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_seat is null then raise exception 'Not a room player'; end if;

  -- Older active rooms predate the clock column; start their first clock
  -- without resetting their board or changing whose turn it is.
  update public.two_player_game_state
  set turn_deadline=now()+interval '30 seconds', updated_at=now()
  where room_id=p_room_id and game_key='four-in-a-row' and status='playing'
    and turn_deadline is null;

  -- A deadline expiry skips the inactive player. The next call then lets a
  -- bot immediately make its legal move if that seat belongs to a bot.
  update public.two_player_game_state
  set current_seat=case when current_seat=1 then 2 else 1 end,
      version=version+1, turn_deadline=now()+interval '30 seconds', updated_at=now()
  where room_id=p_room_id and game_key='four-in-a-row' and status='playing'
    and turn_deadline is not null and turn_deadline<=now();

  perform public.resolve_four_in_a_row_bot_turn(p_room_id);

  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='four-in-a-row';
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',display_name,'is_bot',is_bot) order by seat),'[]'::jsonb)
  into v_players from public.matchmaking_room_players where room_id=p_room_id and left_at is null;

  return jsonb_build_object('state',v_state.state,'current_seat',v_state.current_seat,
    'version',v_state.version,'status',v_state.status,'turn_deadline',v_state.turn_deadline,
    'my_seat',v_seat,'players',v_players);
end $$;

grant execute on function public.start_four_in_a_row_match(uuid) to authenticated;
grant execute on function public.four_in_a_row_move(uuid,integer,integer) to authenticated;
grant execute on function public.resolve_four_in_a_row_bot_turn(uuid) to authenticated;
grant execute on function public.get_four_in_a_row_match(uuid) to authenticated;
