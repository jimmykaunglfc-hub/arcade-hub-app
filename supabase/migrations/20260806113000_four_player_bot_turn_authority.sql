-- A mobile room must not depend on its original host staying in the foreground.
-- Any current human member may submit the version-locked move for the active bot.

create or replace function public.roll_monopoly_dice(p_room_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_version integer; v_active uuid; v_roll public.monopoly_turn_rolls; v_is_member boolean;
begin
 select version,active_player_id into v_version,v_active from public.monopoly_match_state where room_id=p_room_id and status='playing' for update;
 select exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) into v_is_member;
 if v_version is null then raise exception 'Monopoly board is not initialized'; end if;
 if not v_is_member or (v_active is distinct from auth.uid() and v_active::text not like '00000000-0000-4000-8000-%') then raise exception 'It is not your Monopoly turn'; end if;
 if v_version<>p_expected_version then raise exception 'The board changed; please wait for sync'; end if;
 select * into v_roll from public.monopoly_turn_rolls where room_id=p_room_id and state_version=v_version;
 if v_roll.room_id is null then
   insert into public.monopoly_turn_rolls(room_id,state_version,player_id,die_one,die_two)
   values(p_room_id,v_version,v_active,floor(random()*6)::smallint+1,floor(random()*6)::smallint+1) returning * into v_roll;
 end if;
 if v_roll.player_id is distinct from v_active then raise exception 'A roll already exists for this turn'; end if;
 return jsonb_build_object('die_one',v_roll.die_one,'die_two',v_roll.die_two,'version',v_version);
end; $$;

drop function if exists public.update_monopoly_match_state(uuid,jsonb,integer,uuid,boolean);
create or replace function public.update_monopoly_match_state(p_room_id uuid, p_state jsonb, p_expected_version integer, p_next_active_player_id uuid, p_completed boolean default false, p_action text default 'state_sync')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_version integer; v_active uuid; v_roll jsonb; v_deadline timestamptz; v_previous jsonb; v_previous_roster jsonb; v_next_roster jsonb; v_is_member boolean;
begin
 select version,active_player_id,state into v_version,v_active,v_previous from public.monopoly_match_state where room_id=p_room_id and status='playing' for update;
 select exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) into v_is_member;
 if v_version is null then raise exception 'Monopoly board is not initialized'; end if;
 if p_action not in ('state_sync','roll','purchase','skip_purchase','resolve_landing','build','sell_building','mortgage','redeem','propose_trade','confirm_trade','upgrade','open_auction','award_auction','timeout') then raise exception 'Unsupported Monopoly command'; end if;
 if not v_is_member or (v_active is distinct from auth.uid() and v_active::text not like '00000000-0000-4000-8000-%') then raise exception 'It is not your Monopoly turn'; end if;
 if v_version<>p_expected_version then raise exception 'The board changed; please wait for sync'; end if;
 if jsonb_typeof(p_state->'players')<>'array' or jsonb_array_length(p_state->'players')<>4 then raise exception 'A Monopoly board must contain exactly four players'; end if;
 select jsonb_agg(player->>'id' order by position) into v_previous_roster from jsonb_array_elements(v_previous->'players') with ordinality x(player,position);
 select jsonb_agg(player->>'id' order by position) into v_next_roster from jsonb_array_elements(p_state->'players') with ordinality x(player,position);
 if v_previous_roster is distinct from v_next_roster then raise exception 'The Monopoly room roster cannot be changed during a match'; end if;
 if (p_state->>'activePlayerId') is distinct from p_next_active_player_id::text then raise exception 'The submitted active player does not match the requested turn'; end if;
 if not exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'id'=p_next_active_player_id::text and coalesce((p->>'bankrupt')::boolean,false)=false) and not p_completed then raise exception 'The next Monopoly player is not eligible'; end if;
 if exists(select 1 from jsonb_array_elements(p_state->'players') p where coalesce((p->>'cash')::numeric,0)<0 or coalesce((p->>'position')::integer,-1) not between 0 and 39) then raise exception 'Invalid Monopoly player balance or board position'; end if;
 if coalesce((p_state->>'hasRolled')::boolean,false) then
   select jsonb_build_array(die_one,die_two) into v_roll from public.monopoly_turn_rolls where room_id=p_room_id and player_id=v_active and state_version<=v_version order by state_version desc limit 1;
   if v_roll is null or p_state->'dice' is distinct from v_roll then raise exception 'Monopoly dice do not match the server-issued roll'; end if;
 end if;
 update public.monopoly_match_state set state=p_state,active_player_id=p_next_active_player_id,version=version+1,turn_deadline=now()+interval '60 seconds',status=case when p_completed then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id returning turn_deadline into v_deadline;
 insert into public.monopoly_match_events(room_id,state_version,actor_id,action,summary) values(p_room_id,v_version+1,auth.uid(),case when p_completed then 'match_completed' else p_action end,coalesce(p_state->'actionLog'->>'title','Monopoly state updated'));
 return jsonb_build_object('version',v_version+1,'turn_deadline',v_deadline);
end; $$;
grant execute on function public.roll_monopoly_dice(uuid,integer) to authenticated;
grant execute on function public.update_monopoly_match_state(uuid,jsonb,integer,uuid,boolean,text) to authenticated;

create or replace function public.ludo_roll(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor_seat integer; v_current integer; v_state jsonb; v_roll integer; v_can_move boolean := false; v_host_seat integer; v_current_bot boolean;
begin
 select p.seat into v_actor_seat from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null;
 select state,current_seat into v_state,v_current from public.ludo_match_state where room_id=p_room_id and status='playing' for update;
 select is_bot into v_current_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_current and left_at is null;
 if v_actor_seat is null or (v_actor_seat<>v_current and not coalesce(v_current_bot,false)) then raise exception 'It is not your turn'; end if;
 if v_state->>'dice' is not null then raise exception 'Choose a token first'; end if;
 v_roll := floor(random()*6)::integer+1;
 select exists(select 1 from jsonb_array_elements_text(v_state->'tokens'->(v_current-1)) x(value) where ((x.value)::integer=-1 and v_roll=6) or ((x.value)::integer>=0 and (x.value)::integer+v_roll<=58)) into v_can_move;
 if not v_can_move then
   update public.ludo_match_state set current_seat=(v_current%4)+1,turn_deadline=now()+interval '30 seconds',updated_at=now() where room_id=p_room_id;
   return jsonb_build_object('roll',v_roll,'moved',false);
 end if;
 update public.ludo_match_state set state=jsonb_set(v_state,'{dice}',to_jsonb(v_roll)),turn_deadline=now()+interval '30 seconds',updated_at=now() where room_id=p_room_id;
 return jsonb_build_object('roll',v_roll,'moved',true);
end; $$;

create or replace function public.ludo_move(p_room_id uuid, p_piece integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor_seat integer; v_current integer; v_state jsonb; v_roll integer; v_old integer; v_new integer; v_global integer; v_opponent integer; v_index integer; v_value integer; v_capture boolean:=false; v_tokens jsonb; v_current_bot boolean;
begin
 if p_piece not between 0 and 3 then raise exception 'Invalid token'; end if;
 select p.seat into v_actor_seat from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null;
 select state,current_seat into v_state,v_current from public.ludo_match_state where room_id=p_room_id and status='playing' for update;
 select is_bot into v_current_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_current and left_at is null;
 if v_actor_seat is null or (v_actor_seat<>v_current and not coalesce(v_current_bot,false)) then raise exception 'It is not your turn'; end if;
 v_roll := (v_state->>'dice')::integer; if v_roll is null then raise exception 'Roll the dice first'; end if;
 v_old := (v_state->'tokens'->(v_current-1)->>p_piece)::integer;
 if (v_old=-1 and v_roll<>6) or (v_old>=0 and v_old+v_roll>58) then raise exception 'That token cannot move'; end if;
 v_new := case when v_old=-1 then 0 else v_old+v_roll end;
 v_tokens := jsonb_set(v_state->'tokens', array[(v_current-1)::text,p_piece::text], to_jsonb(v_new));
 if v_new<52 and mod((array[39,0,13,26])[v_current]+v_new,52) not in (0,8,13,21,26,34,39,47) then
   v_global := mod((array[39,0,13,26])[v_current]+v_new,52);
   for v_opponent in 1..4 loop if v_opponent<>v_current then for v_index in 0..3 loop
     v_value := (v_tokens->(v_opponent-1)->>v_index)::integer;
     if v_value>=0 and v_value<52 and mod((array[39,0,13,26])[v_opponent]+v_value,52)=v_global then v_tokens:=jsonb_set(v_tokens,array[(v_opponent-1)::text,v_index::text],'-1'::jsonb); v_capture:=true; end if;
   end loop; end if; end loop;
 end if;
 v_state:=jsonb_set(jsonb_set(v_state,'{tokens}',v_tokens),'{dice}','null'::jsonb);
 if not exists(select 1 from jsonb_array_elements_text(v_tokens->(v_current-1)) x(value) where (x.value)::integer<>58) then v_state:=jsonb_set(v_state,'{winner_seat}',to_jsonb(v_current)); end if;
 update public.ludo_match_state set state=v_state,current_seat=case when v_new=58 and not exists(select 1 from jsonb_array_elements_text(v_tokens->(v_current-1)) x(value) where (x.value)::integer<>58) then v_current when v_roll=6 or v_capture then v_current else (v_current%4)+1 end,turn_deadline=now()+interval '30 seconds',status=case when v_state->>'winner_seat' is not null then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
 if v_state->>'winner_seat' is not null then insert into public.ludo_match_results(room_id,winner_seat) values(p_room_id,v_current) on conflict(room_id) do nothing; update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
 return jsonb_build_object('moved',true,'capture',v_capture);
end; $$;
grant execute on function public.ludo_roll(uuid) to authenticated;
grant execute on function public.ludo_move(uuid,integer) to authenticated;
