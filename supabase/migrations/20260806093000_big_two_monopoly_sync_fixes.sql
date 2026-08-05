-- Follow-up synchronization fixes.  This is deliberately a new migration:
-- editing an already-applied migration does not update a production database.

create or replace function public.big_two_play_cards(p_room_id uuid, p_cards jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_seat integer; v_hand jsonb; v_state jsonb; v_current integer; v_remaining jsonb; v_count integer; v_next integer; v_table_count integer;
begin
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not in (1,2,3,5) then raise exception 'Invalid card count'; end if;
  if (select count(distinct card->>'id') from jsonb_array_elements(p_cards) card) <> jsonb_array_length(p_cards) then raise exception 'A card may be played only once'; end if;
  select p.seat into v_seat from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null;
  select state,current_seat into v_state,v_current from public.big_two_match_state where room_id=p_room_id and status='playing' for update;
  if v_seat is null or v_seat <> v_current then raise exception 'It is not your turn'; end if;
  v_table_count := jsonb_array_length(coalesce(v_state->'table_cards', '[]'::jsonb));
  if v_table_count > 0 and not coalesce((v_state->>'free_lead')::boolean, false) and v_table_count <> jsonb_array_length(p_cards) then raise exception 'Your play must match the table card count'; end if;
  if coalesce((v_state->>'opening_required')::boolean, false) and exists (select 1 from public.big_two_player_hands h where h.room_id=p_room_id and h.seat=v_seat and h.cards @> '[{"id":"0-0"}]'::jsonb) and not p_cards @> '[{"id":"0-0"}]'::jsonb then raise exception 'The opening play must include 3 of diamonds'; end if;
  select cards into v_hand from public.big_two_player_hands where room_id=p_room_id and seat=v_seat for update;
  if (select count(*) from jsonb_array_elements(p_cards) wanted where not exists (select 1 from jsonb_array_elements(v_hand) owned where owned->>'id'=wanted->>'id')) > 0 then raise exception 'Card is not in your hand'; end if;
  select coalesce(jsonb_agg(card),'[]'::jsonb) into v_remaining from jsonb_array_elements(v_hand) card where not exists (select 1 from jsonb_array_elements(p_cards) played where played->>'id'=card->>'id');
  v_count := jsonb_array_length(v_remaining); v_next := (v_current % 4) + 1;
  update public.big_two_player_hands set cards=v_remaining,updated_at=now() where room_id=p_room_id and seat=v_seat;
  -- Store a final, authoritative winner seat for every result.  A missed
  -- 1 Card declaration forfeits to the next seat; otherwise the player who
  -- emptied their hand is the winner.
  if v_count = 0 then
    v_state := jsonb_set(v_state, '{winner_seat}', to_jsonb(case when coalesce((v_state->>'one_card_called_seat')::integer, 0) = v_seat then v_seat else (v_seat % 4) + 1 end));
  end if;
  update public.big_two_match_state
  set state=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_state,'{one_card_called_seat}','null'::jsonb),'{table_cards}',p_cards),'{passes}','0'::jsonb),'{opening_required}','false'::jsonb),'{free_lead}','false'::jsonb),'{last_play_seat}',to_jsonb(v_seat)),array['hand_counts',(v_seat-1)::text],to_jsonb(v_count)),
      current_seat=v_next, turn_deadline=now()+interval '30 seconds', status=case when v_count=0 then 'completed' else 'playing' end,updated_at=now()
  where room_id=p_room_id;
  return jsonb_build_object('current_seat',v_next,'hand_count',v_count,'completed',v_count=0);
end; $$;

create or replace function public.advance_monopoly_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state jsonb; v_deadline timestamptz; v_next uuid;
begin
  select state,turn_deadline into v_state,v_deadline from public.monopoly_match_state where room_id=p_room_id and status='playing' for update;
  if v_deadline is null then raise exception 'Monopoly match not found'; end if;
  if v_deadline > now() then return jsonb_build_object('advanced',false); end if;
  select (player->>'id')::uuid into v_next
  from jsonb_array_elements(v_state->'players') with ordinality x(player,position)
  where coalesce((player->>'bankrupt')::boolean,false)=false
  order by case when position > coalesce((select position from jsonb_array_elements(v_state->'players') with ordinality y(player,position) where y.player->>'id'=v_state->>'activePlayerId' limit 1),0) then 0 else 1 end, position
  limit 1;
  if v_next is null then raise exception 'No eligible Monopoly player remains'; end if;
  -- A timeout must be a complete turn transition.  Leaving transient dice,
  -- purchase, alert or movement state behind is what previously disabled the
  -- next player's dice.
  v_state := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_state,'{activePlayerId}',to_jsonb(v_next::text)),'{hasRolled}','false'::jsonb),'{pendingPurchaseId}','null'::jsonb),'{alert}','null'::jsonb),'{actionPanel}','null'::jsonb),'{autoPassPlayerId}','null'::jsonb),'{turnWarning}','false'::jsonb),'{actionLog}',jsonb_build_object('title','Turn timed out','highlight','NEXT PLAYER READY'));
  update public.monopoly_match_state set state=v_state,active_player_id=v_next,version=version+1,turn_deadline=now()+interval '60 seconds',updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('advanced',true,'next_player_id',v_next);
end; $$;

-- Bot turns use the same authoritative winner field as human turns.  Without
-- this, a bot result could be rendered as the last locally-known player on
-- each device.
create or replace function public.big_two_timeout_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state jsonb; v_current integer; v_deadline timestamptz; v_bot boolean; v_hand jsonb; v_card jsonb; v_remaining jsonb; v_next integer;
begin
  select state,current_seat,turn_deadline into v_state,v_current,v_deadline from public.big_two_match_state where room_id=p_room_id and status='playing' for update;
  if v_current is null then return jsonb_build_object('advanced',false); end if;
  select is_bot into v_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_current and left_at is null;
  if v_deadline>now() and not coalesce(v_bot,false) then return jsonb_build_object('advanced',false); end if;
  if not coalesce(v_bot,false) then
    update public.big_two_match_state set current_seat=(v_current%4)+1,turn_deadline=now()+interval '30 seconds',updated_at=now() where room_id=p_room_id;
    return jsonb_build_object('advanced',true,'timed_out_human',true);
  end if;
  select cards into v_hand from public.big_two_player_hands where room_id=p_room_id and seat=v_current for update;
  select card into v_card from jsonb_array_elements(v_hand) card where card->>'id'='0-0' limit 1;
  if v_card is null and (coalesce((v_state->>'free_lead')::boolean,false) or jsonb_array_length(coalesce(v_state->'table_cards','[]'::jsonb))=0) then
    select card into v_card from jsonb_array_elements(v_hand) card order by (card->>'rank')::integer,(card->>'suit')::integer limit 1;
  end if;
  if v_card is null then
    v_state:=jsonb_set(v_state,'{passes}',to_jsonb(coalesce((v_state->>'passes')::integer,0)+1));
    if (v_state->>'passes')::integer >= 3 then
      v_state:=jsonb_set(jsonb_set(v_state,'{passes}','0'::jsonb),'{free_lead}','true'::jsonb);
      v_next:=coalesce((v_state->>'last_play_seat')::integer,v_current);
    else v_next:=(v_current%4)+1; end if;
    update public.big_two_match_state set state=v_state,current_seat=v_next,turn_deadline=now()+interval '30 seconds',updated_at=now() where room_id=p_room_id;
    return jsonb_build_object('advanced',true,'bot_passed',true);
  end if;
  select coalesce(jsonb_agg(card),'[]'::jsonb) into v_remaining from jsonb_array_elements(v_hand) card where card->>'id'<>v_card->>'id';
  v_next:=(v_current%4)+1;
  update public.big_two_player_hands set cards=v_remaining,updated_at=now() where room_id=p_room_id and seat=v_current;
  v_state:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_state,'{table_cards}',jsonb_build_array(v_card)),'{last_play_seat}',to_jsonb(v_current)),'{passes}','0'::jsonb),'{opening_required}','false'::jsonb),'{free_lead}','false'::jsonb),array['hand_counts',(v_current-1)::text],to_jsonb(jsonb_array_length(v_remaining)));
  if jsonb_array_length(v_remaining)=0 then v_state:=jsonb_set(v_state,'{winner_seat}',to_jsonb(v_current)); end if;
  update public.big_two_match_state set state=v_state,current_seat=v_next,turn_deadline=now()+interval '30 seconds',status=case when jsonb_array_length(v_remaining)=0 then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('advanced',true,'bot_played',v_card);
end; $$;
