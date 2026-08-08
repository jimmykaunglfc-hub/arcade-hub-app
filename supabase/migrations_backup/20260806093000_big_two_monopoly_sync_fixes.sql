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
  -- Jail is one skipped turn. Resolve it here, on the server, so it works even
  -- if the jailed player's client has been backgrounded or disconnected.
  if exists(select 1 from jsonb_array_elements(v_state->'players') player where player->>'id'=v_state->>'activePlayerId' and coalesce((player->>'inJail')::boolean,false)) then
    v_state:=jsonb_set(v_state,'{players}',(select jsonb_agg(case when player->>'id'=v_state->>'activePlayerId' then jsonb_set(jsonb_set(player,'{inJail}','false'::jsonb),'{jailAttempts}','0'::jsonb) else player end order by position) from jsonb_array_elements(v_state->'players') with ordinality x(player,position)));
  end if;
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

-- Deal once, then immediately resolve an opening bot seat.  This makes the
-- 3♦ opener server-driven and avoids a room being frozen when no human client
-- happens to be the one running a browser timer.
create or replace function public.big_two_deal_room(p_room_id uuid, p_turn_seconds integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_host uuid; v_count integer; v_room_status text; v_deck jsonb; v_seat integer; v_starter integer := 1; v_starter_is_bot boolean;
begin
  select host_id,status into v_host,v_room_status from public.matchmaking_rooms where id=p_room_id for update;
  select count(*) into v_count from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
  if v_host is distinct from auth.uid() or v_count<>4 then raise exception 'Only the host may deal a full four-player room'; end if;
  if v_room_status<>'starting' then raise exception 'This room has already been dealt or is not ready'; end if;
  select jsonb_agg(jsonb_build_object('id',rank||'-'||suit,'rank',rank,'suit',suit) order by random()) into v_deck from generate_series(0,12) r(rank) cross join generate_series(0,3) s(suit);
  delete from public.big_two_player_hands where room_id=p_room_id;
  for v_seat in 1..4 loop
    insert into public.big_two_player_hands(room_id,seat,cards)
      select p_room_id,v_seat,jsonb_agg(v_deck->(ordinality-1) order by ordinality) from generate_series((v_seat-1)*13+1,v_seat*13) ordinality;
    if exists(select 1 from public.big_two_player_hands h,jsonb_array_elements(h.cards) c where h.room_id=p_room_id and h.seat=v_seat and (c->>'rank')::integer=0 and (c->>'suit')::integer=0) then v_starter:=v_seat; end if;
  end loop;
  insert into public.big_two_match_state(room_id,state,current_seat,turn_deadline,status)
  values(p_room_id,jsonb_build_object('hand_counts',jsonb_build_array(13,13,13,13),'table_cards','[]'::jsonb,'passes',0,'opening_required',true,'free_lead',false,'one_card_called_seat',null,'last_play_seat',null,'winner_seat',null),v_starter,now()+make_interval(secs=>greatest(10,least(p_turn_seconds,90))),'playing')
  on conflict(room_id) do update set state=excluded.state,current_seat=excluded.current_seat,turn_deadline=excluded.turn_deadline,status='playing',updated_at=now();
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  select is_bot into v_starter_is_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_starter and left_at is null;
  if coalesce(v_starter_is_bot,false) then perform public.big_two_timeout_turn(p_room_id); end if;
  return jsonb_build_object('room_id',p_room_id,'starter_seat',v_starter);
end; $$;

-- Trade settlement is recipient-authorized on the server.  A proposer cannot
-- accept their own request, and cash-only requests are not valid trades.
create or replace function public.accept_monopoly_trade(p_room_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state jsonb; v_version integer; v_trade jsonb; v_proposer jsonb; v_recipient jsonb; v_players jsonb;
  v_proposer_id text; v_recipient_id text; v_offered integer; v_requested integer; v_offer_property text; v_request_property text;
  v_offer_jail boolean; v_request_jail boolean; v_proposer_owned jsonb; v_recipient_owned jsonb;
begin
  select state,version into v_state,v_version from public.monopoly_match_state where room_id=p_room_id and status='playing' for update;
  if v_state is null or v_version<>p_expected_version then raise exception 'The board changed; please wait for sync'; end if;
  v_trade:=v_state#>'{actionPanel,trade}';
  if v_trade is null or not coalesce((v_trade->>'awaitingConfirmation')::boolean,false) then raise exception 'There is no trade awaiting confirmation'; end if;
  v_proposer_id:=v_trade->>'proposerId'; v_recipient_id:=v_trade->>'recipientId';
  if auth.uid()::text is distinct from v_recipient_id or v_proposer_id=v_recipient_id then raise exception 'Only the selected recipient may accept this trade'; end if;
  v_offered:=greatest(0,coalesce((v_trade->>'offeredCash')::integer,0)); v_requested:=greatest(0,coalesce((v_trade->>'requestedCash')::integer,0));
  v_offer_property:=nullif(v_trade->>'offeredPropertyId',''); v_request_property:=nullif(v_trade->>'requestedPropertyId','');
  v_offer_jail:=coalesce((v_trade->>'offeredJailFreeCard')::boolean,false); v_request_jail:=coalesce((v_trade->>'requestedJailFreeCard')::boolean,false);
  if v_offer_property is null and v_request_property is null and not v_offer_jail and not v_request_jail then raise exception 'A trade must include a title or Jail-Free card'; end if;
  select player into v_proposer from jsonb_array_elements(v_state->'players') player where player->>'id'=v_proposer_id;
  select player into v_recipient from jsonb_array_elements(v_state->'players') player where player->>'id'=v_recipient_id;
  if v_proposer is null or v_recipient is null or coalesce((v_proposer->>'bankrupt')::boolean,false) or coalesce((v_recipient->>'bankrupt')::boolean,false) then raise exception 'Trade participant is unavailable'; end if;
  if v_offered>(v_proposer->>'cash')::integer or v_requested>(v_recipient->>'cash')::integer then raise exception 'Trade cash is no longer available'; end if;
  if v_offer_property is not null and (not (coalesce(v_proposer->'ownedSpaceIds','[]'::jsonb) ? v_offer_property) or coalesce((v_proposer->'propertyLevels'->>v_offer_property)::integer,0)<>0 or coalesce(v_proposer->'mortgagedSpaceIds','[]'::jsonb) ? v_offer_property) then raise exception 'Offered title is not transferable'; end if;
  if v_request_property is not null and (not (coalesce(v_recipient->'ownedSpaceIds','[]'::jsonb) ? v_request_property) or coalesce((v_recipient->'propertyLevels'->>v_request_property)::integer,0)<>0 or coalesce(v_recipient->'mortgagedSpaceIds','[]'::jsonb) ? v_request_property) then raise exception 'Requested title is not transferable'; end if;
  if v_offer_jail and coalesce((v_proposer->>'jailFreeCards')::integer,0)<1 then raise exception 'Offered Jail-Free card is unavailable'; end if;
  if v_request_jail and coalesce((v_recipient->>'jailFreeCards')::integer,0)<1 then raise exception 'Requested Jail-Free card is unavailable'; end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_proposer_owned from jsonb_array_elements_text(coalesce(v_proposer->'ownedSpaceIds','[]'::jsonb)) value where value is distinct from v_offer_property;
  if v_request_property is not null then v_proposer_owned:=v_proposer_owned||jsonb_build_array(v_request_property); end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_recipient_owned from jsonb_array_elements_text(coalesce(v_recipient->'ownedSpaceIds','[]'::jsonb)) value where value is distinct from v_request_property;
  if v_offer_property is not null then v_recipient_owned:=v_recipient_owned||jsonb_build_array(v_offer_property); end if;
  v_proposer:=jsonb_set(jsonb_set(jsonb_set(v_proposer,'{cash}',to_jsonb((v_proposer->>'cash')::integer-v_offered+v_requested)),'{ownedSpaceIds}',v_proposer_owned),'{jailFreeCards}',to_jsonb(coalesce((v_proposer->>'jailFreeCards')::integer,0)-case when v_offer_jail then 1 else 0 end+case when v_request_jail then 1 else 0 end));
  v_recipient:=jsonb_set(jsonb_set(jsonb_set(v_recipient,'{cash}',to_jsonb((v_recipient->>'cash')::integer+v_offered-v_requested)),'{ownedSpaceIds}',v_recipient_owned),'{jailFreeCards}',to_jsonb(coalesce((v_recipient->>'jailFreeCards')::integer,0)+case when v_offer_jail then 1 else 0 end-case when v_request_jail then 1 else 0 end));
  if v_offer_property is not null then v_proposer:=jsonb_set(v_proposer,'{propertyLevels}',coalesce(v_proposer->'propertyLevels','{}'::jsonb)-v_offer_property); v_recipient:=jsonb_set(v_recipient,'{propertyLevels}',coalesce(v_recipient->'propertyLevels','{}'::jsonb)||jsonb_build_object(v_offer_property,0)); end if;
  if v_request_property is not null then v_recipient:=jsonb_set(v_recipient,'{propertyLevels}',coalesce(v_recipient->'propertyLevels','{}'::jsonb)-v_request_property); v_proposer:=jsonb_set(v_proposer,'{propertyLevels}',coalesce(v_proposer->'propertyLevels','{}'::jsonb)||jsonb_build_object(v_request_property,0)); end if;
  select jsonb_agg(case when player->>'id'=v_proposer_id then v_proposer when player->>'id'=v_recipient_id then v_recipient else player end order by position) into v_players from jsonb_array_elements(v_state->'players') with ordinality x(player,position);
  v_state:=jsonb_set(jsonb_set(jsonb_set(v_state,'{players}',v_players),'{actionPanel}','null'::jsonb),'{actionLog}',jsonb_build_object('title','Trade confirmed','highlight','RECIPIENT APPROVED THE TERMS'));
  update public.monopoly_match_state set state=v_state,version=version+1,updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('accepted',true,'version',v_version+1);
end; $$;
grant execute on function public.accept_monopoly_trade(uuid,integer) to authenticated;
