-- Critical Bingo repair: jsonb_set requires JSON null, not SQL NULL.
-- Without this, every normal ball draw fails before a winner exists.

create or replace function public.bingo_draw_number(p_room_id uuid, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state public.two_player_game_state; v_called jsonb; v_draw integer; v_bot record;
  v_card jsonb; v_marked jsonb; v_index integer; v_winner integer := null;
  v_auto boolean; v_next_state jsonb;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  if v_state.status <> 'playing' then raise exception 'Bingo game is not active'; end if;
  if not exists (select 1 from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  v_called:=coalesce(v_state.state->'called_numbers','[]'::jsonb);
  select number into v_draw from generate_series(1,75) number
  where not (v_called @> jsonb_build_array(number)) order by random() limit 1;
  if v_draw is null then raise exception 'All Bingo balls were called'; end if;
  v_called:=v_called || jsonb_build_array(v_draw);
  for v_bot in select seat from public.matchmaking_room_players where room_id=p_room_id and is_bot and left_at is null loop
    select card,marked into v_card,v_marked from public.bingo_match_cards where room_id=p_room_id and seat=v_bot.seat for update;
    for v_index in 0..24 loop
      if (v_card->>v_index)=v_draw::text and not (v_marked @> jsonb_build_array(v_index)) then
        v_marked:=v_marked || jsonb_build_array(v_index);
      end if;
    end loop;
    update public.bingo_match_cards set marked=v_marked,updated_at=now() where room_id=p_room_id and seat=v_bot.seat;
    if public.bingo_line_count(v_marked)>=1 then v_winner:=v_bot.seat; end if;
  end loop;
  v_auto:=coalesce((v_state.state->>'auto_calling')::boolean,true);
  v_next_state:=jsonb_set(jsonb_set(v_state.state,'{called_numbers}',v_called,true),'{winner_seat}',coalesce(to_jsonb(v_winner),'null'::jsonb),true);
  v_next_state:=jsonb_set(v_next_state,'{next_draw_at}',case when v_auto then to_jsonb(now()+interval '5 seconds') else 'null'::jsonb end,true);
  update public.two_player_game_state
  set state=v_next_state,version=version+1,status=case when v_winner is null then 'playing' else 'completed' end,updated_at=now()
  where room_id=p_room_id;
  if v_winner is not null then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('number',v_draw,'version',v_state.version+1,'winner_seat',v_winner);
end $$;

create or replace function public.bingo_mark_square(p_room_id uuid,p_tile_index integer,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint; v_card jsonb; v_marked jsonb; v_number text; v_winner integer := null;
begin
  if p_tile_index not between 0 and 24 then raise exception 'Invalid Bingo square'; end if;
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.status<>'playing' or v_seat is null then raise exception 'Bingo game is not active'; end if;
  select card,marked into v_card,v_marked from public.bingo_match_cards where room_id=p_room_id and seat=v_seat for update;
  v_number:=v_card->>p_tile_index;
  if p_tile_index<>12 and not (coalesce(v_state.state->'called_numbers','[]'::jsonb) @> jsonb_build_array((v_number)::integer)) then raise exception 'That number has not been called'; end if;
  if not (v_marked @> jsonb_build_array(p_tile_index)) then v_marked:=v_marked || jsonb_build_array(p_tile_index); end if;
  if public.bingo_line_count(v_marked)>=1 then v_winner:=v_seat; end if;
  update public.bingo_match_cards set marked=v_marked,updated_at=now() where room_id=p_room_id and seat=v_seat;
  update public.two_player_game_state
  set state=jsonb_set(v_state.state,'{winner_seat}',coalesce(to_jsonb(v_winner),'null'::jsonb),true),
      version=version+1,status=case when v_winner is null then 'playing' else 'completed' end,updated_at=now()
  where room_id=p_room_id;
  if v_winner is not null then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('version',v_state.version+1,'winner_seat',v_winner);
end $$;

grant execute on function public.bingo_draw_number(uuid,integer) to authenticated;
grant execute on function public.bingo_mark_square(uuid,integer,integer) to authenticated;
