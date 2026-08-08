-- Bingo shared caller: the database owns the 5-second schedule.
-- Run this after 20260807160000_bingo_human_matchmaking.sql.

create or replace function public.initialize_bingo_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_players integer; v_seat integer;
begin
  if not exists (select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  if exists (
    select 1 from public.two_player_game_state s
    where s.room_id=p_room_id and s.game_key='bingo' and s.status in ('playing','completed')
      and (select count(*) from public.bingo_match_cards c where c.room_id=p_room_id) = 2
  ) then return jsonb_build_object('room_id',p_room_id,'started',true); end if;
  select count(*) into v_players from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
  if v_players<>2 then raise exception 'Bingo needs two players'; end if;
  delete from public.bingo_match_cards where room_id=p_room_id;
  for v_seat in 1..2 loop
    insert into public.bingo_match_cards(room_id,seat,card,marked)
    values(p_room_id,v_seat,public.bingo_new_card(),'[12]'::jsonb);
  end loop;
  update public.two_player_game_state
  set state=jsonb_build_object('called_numbers','[]'::jsonb,'winner_seat',null,'auto_calling',true,'next_draw_at',now()+interval '5 seconds'),
      current_seat=1, version=version+1, status='playing', updated_at=now()
  where room_id=p_room_id and game_key='bingo';
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'started',true);
end $$;

create or replace function public.bingo_draw_number(p_room_id uuid, p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state public.two_player_game_state; v_called jsonb; v_draw integer; v_bot record;
  v_card jsonb; v_marked jsonb; v_index integer; v_winner integer := null;
  v_auto boolean; v_next_state jsonb;
begin
  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='bingo' for update;
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
    if public.bingo_line_count(v_marked)>=5 then v_winner:=v_bot.seat; end if;
  end loop;
  v_auto:=coalesce((v_state.state->>'auto_calling')::boolean,true);
  v_next_state:=jsonb_set(jsonb_set(v_state.state,'{called_numbers}',v_called,true),'{winner_seat}',to_jsonb(v_winner),true);
  v_next_state:=jsonb_set(v_next_state,'{next_draw_at}',case when v_auto then to_jsonb(now()+interval '5 seconds') else 'null'::jsonb end,true);
  update public.two_player_game_state
  set state=v_next_state,version=version+1,status=case when v_winner is null then 'playing' else 'completed' end,updated_at=now()
  where room_id=p_room_id;
  if v_winner is not null then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('number',v_draw,'version',v_state.version+1,'winner_seat',v_winner);
end $$;

create or replace function public.advance_bingo_draws(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_due timestamptz; v_auto boolean;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  if v_state.status <> 'playing' then return jsonb_build_object('drawn',false); end if;
  if not exists (select 1 from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  v_auto:=coalesce((v_state.state->>'auto_calling')::boolean,true);
  v_due:=nullif(v_state.state->>'next_draw_at','')::timestamptz;
  if v_auto and (v_due is null or v_due <= now()) then
    perform public.bingo_draw_number(p_room_id,null);
    return jsonb_build_object('drawn',true);
  end if;
  return jsonb_build_object('drawn',false);
end $$;

create or replace function public.bingo_set_auto_calling(p_room_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_next jsonb;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  if v_state.status <> 'playing' then raise exception 'Bingo game is not active'; end if;
  if not exists (select 1 from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  v_next:=jsonb_set(v_state.state,'{auto_calling}',to_jsonb(p_enabled),true);
  v_next:=jsonb_set(v_next,'{next_draw_at}',case when p_enabled then to_jsonb(now()+interval '5 seconds') else 'null'::jsonb end,true);
  update public.two_player_game_state set state=v_next,version=version+1,updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('auto_calling',p_enabled,'version',v_state.version+1);
end $$;

grant execute on function public.initialize_bingo_match(uuid) to authenticated;
grant execute on function public.bingo_draw_number(uuid,integer) to authenticated;
grant execute on function public.advance_bingo_draws(uuid) to authenticated;
grant execute on function public.bingo_set_auto_calling(uuid,boolean) to authenticated;

-- Existing rooms created before this migration immediately gain the caller.
update public.two_player_game_state
set state=jsonb_set(jsonb_set(state,'{auto_calling}','true'::jsonb,true),'{next_draw_at}',to_jsonb(now()+interval '5 seconds'),true), updated_at=now()
where game_key='bingo' and status='playing' and not (state ? 'auto_calling');
