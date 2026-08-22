-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE TYPE public.app_role AS ENUM (
  'player',
  'moderator',
  'admin',
  'super_admin'
);

CREATE TYPE public.currency_type AS ENUM (
  'fiat_usd',
  'gems',
  'points'
);

CREATE TYPE public.invite_state AS ENUM (
  'pending',
  'accepted',
  'declined'
);

CREATE TYPE public.item_category AS ENUM (
  'cosmetic',
  'gem_pack'
);

CREATE TYPE public.match_type AS ENUM (
  'quick',
  'ranked',
  'casual',
  'private',
  'tournament'
);

CREATE TYPE public.product_type AS ENUM (
  'credit_pack',
  'cosmetic',
  'theme',
  'avatar',
  'premium_pass'
);

CREATE TYPE public.reward_type AS ENUM (
  'gems',
  'points'
);

CREATE TYPE public.session_state AS ENUM (
  'lobby',
  'active',
  'finished',
  'cancelled'
);

CREATE TYPE public.tournament_status AS ENUM (
  'upcoming',
  'active',
  'completed',
  'cancelled'
);

CREATE FUNCTION public.accept_monopoly_trade (
  p_room_id          uuid,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.accept_monopoly_trade(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.accept_monopoly_trade(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.accept_monopoly_trade(uuid, integer) TO service_role;

CREATE FUNCTION public.advance_bingo_draws (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.advance_bingo_draws(uuid) TO anon;

GRANT ALL ON FUNCTION public.advance_bingo_draws(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.advance_bingo_draws(uuid) TO service_role;

CREATE FUNCTION public.advance_monopoly_timeout (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_state jsonb;
  v_deadline timestamptz;
  v_active uuid;
  v_active_position integer;
  v_next uuid;
  v_version integer;
  v_next_deadline timestamptz;
begin
  select state, turn_deadline, active_player_id, version
    into v_state, v_deadline, v_active, v_version
  from public.monopoly_match_state
  where room_id=p_room_id and status='playing'
  for update;

  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'match_not_playing');
  end if;
  if v_deadline > now() then
    return jsonb_build_object('advanced', false, 'reason', 'deadline_not_reached');
  end if;

  select position into v_active_position
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where roster.player->>'id'=v_active::text
  limit 1;

  select (roster.player->>'id')::uuid into v_next
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where not coalesce((roster.player->>'bankrupt')::boolean, false)
  order by case when roster.position > coalesce(v_active_position, 0) then 0 else 1 end,
           roster.position
  limit 1;

  if v_next is null or v_next=v_active then
    return jsonb_build_object('advanced', false, 'reason', 'no_next_player');
  end if;

  -- Jail consumes exactly one turn, including a timeout while backgrounded.
  v_state := jsonb_set(
    v_state,
    '{players}',
    (
      select jsonb_agg(
        case when roster.player->>'id'=v_active::text
          then jsonb_set(jsonb_set(roster.player, '{inJail}', 'false'::jsonb), '{jailAttempts}', '0'::jsonb)
          else roster.player
        end
        order by roster.position
      )
      from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
    )
  );
  v_state := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)),
              '{hasRolled}', 'false'::jsonb),
            '{pendingPurchaseId}', 'null'::jsonb),
          '{alert}', 'null'::jsonb),
        '{actionPanel}', 'null'::jsonb),
      '{autoPassPlayerId}', 'null'::jsonb),
    '{turnWarning}', 'false'::jsonb);
  v_state := jsonb_set(v_state, '{actionLog}', jsonb_build_object(
    'title', 'Turn timed out', 'highlight', 'NEXT PLAYER READY'
  ));

  update public.monopoly_match_state
  set state=v_state,
      active_player_id=v_next,
      version=v_version+1,
      turn_deadline=now()+interval '60 seconds',
      updated_at=now()
  where room_id=p_room_id
  returning turn_deadline into v_next_deadline;

  return jsonb_build_object(
    'advanced', true,
    'state', v_state,
    'active_player_id', v_next,
    'version', v_version+1,
    'turn_deadline', v_next_deadline
  );
end;
$function$;

GRANT ALL ON FUNCTION public.advance_monopoly_timeout(uuid) TO anon;

GRANT ALL ON FUNCTION public.advance_monopoly_timeout(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.advance_monopoly_timeout(uuid) TO service_role;

CREATE FUNCTION public.apply_referral_code (
  p_referral_code text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare me public.profiles; inviter public.profiles; cfg public.platform_config; rule public.referral_milestone_rules; invitee_count integer;
begin
  select * into me from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if me.referred_by is not null then raise exception 'A referral has already been applied'; end if;
  select * into inviter from public.profiles where lower(referral_code)=lower(btrim(p_referral_code)) for update;
  if not found or inviter.id=me.id then raise exception 'Referral code is invalid'; end if;
  select * into cfg from public.platform_config where id=1;
  update public.profiles set referred_by=inviter.id, points=coalesce(points,0)+coalesce(cfg.referral_new_user_points,100) where id=me.id;
  update public.profiles set points=coalesce(points,0)+coalesce(cfg.referral_inviter_points,500), gems=coalesce(gems,0)+coalesce(cfg.referral_inviter_gems,10) where id=inviter.id;
  select count(*) into invitee_count from public.profiles where referred_by=inviter.id;
  for rule in select * from public.referral_milestone_rules where is_active and invitee_target <= invitee_count loop
    insert into public.referral_reward_grants(inviter_id, invitee_id, rule_type, rule_id, reward_points, reward_gems)
    values(inviter.id, me.id, 'milestone', rule.id, rule.reward_points, rule.reward_gems) on conflict do nothing;
    if found then update public.profiles set points=coalesce(points,0)+rule.reward_points, gems=coalesce(gems,0)+rule.reward_gems where id=inviter.id; end if;
  end loop;
end; $function$;

REVOKE ALL ON FUNCTION public.apply_referral_code(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.apply_referral_code(text) TO anon;

GRANT ALL ON FUNCTION public.apply_referral_code(text) TO authenticated;

GRANT ALL ON FUNCTION public.apply_referral_code(text) TO service_role;

CREATE FUNCTION public.assign_profile_network_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.network_id is null or btrim(new.network_id) = '' then
    new.network_id := lower(regexp_replace(coalesce(new.username, 'player'), '[^a-zA-Z0-9_]+', '', 'g')) || '-' || substr(new.id::text, 1, 8);
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.assign_profile_network_id() TO anon;

GRANT ALL ON FUNCTION public.assign_profile_network_id() TO authenticated;

GRANT ALL ON FUNCTION public.assign_profile_network_id() TO service_role;

CREATE FUNCTION public.assign_profile_referral_code()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  return new;
end; $function$;

GRANT ALL ON FUNCTION public.assign_profile_referral_code() TO anon;

GRANT ALL ON FUNCTION public.assign_profile_referral_code() TO authenticated;

GRANT ALL ON FUNCTION public.assign_profile_referral_code() TO service_role;

CREATE FUNCTION public.award_match_xp()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare amount integer;
begin
  amount := case lower(coalesce(new.result, '')) when 'win' then 100 when 'victory' then 100 when 'draw' then 60 when 'loss' then 25 when 'defeat' then 25 else 0 end;
  if amount > 0 then update public.profiles set xp = xp + amount where id = new.user_id; end if;
  return new;
end; $function$;

GRANT ALL ON FUNCTION public.award_match_xp() TO anon;

GRANT ALL ON FUNCTION public.award_match_xp() TO authenticated;

GRANT ALL ON FUNCTION public.award_match_xp() TO service_role;

CREATE FUNCTION public.award_referral_purchase (
  p_buyer_id    uuid,
  p_purchase_id text,
  p_amount      numeric,
  p_currency    text    DEFAULT 'usd'::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare buyer public.profiles; rule public.referral_purchase_rules;
begin
  select * into buyer from public.profiles where id=p_buyer_id;
  if buyer.referred_by is null then return; end if;
  for rule in select * from public.referral_purchase_rules where is_active and lower(purchase_currency)=lower(p_currency) and p_amount >= minimum_purchase_amount loop
    insert into public.referral_reward_grants(inviter_id, invitee_id, rule_type, rule_id, purchase_id, reward_points, reward_gems)
    values(buyer.referred_by, buyer.id, 'purchase', rule.id, p_purchase_id, rule.reward_points, rule.reward_gems)
    on conflict do nothing;
    if found then update public.profiles set points=coalesce(points,0)+rule.reward_points, gems=coalesce(gems,0)+rule.reward_gems where id=buyer.referred_by; end if;
  end loop;
end; $function$;

REVOKE ALL ON FUNCTION public.award_referral_purchase(uuid, text, numeric, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.award_referral_purchase(uuid, text, numeric, text) TO anon;

GRANT ALL ON FUNCTION public.award_referral_purchase(uuid, text, numeric, text) TO service_role;

CREATE FUNCTION public.award_winner (
  winner_id uuid,
  reward    integer
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
begin
  update users set points = points + reward where id = winner_id;
end;
$function$;

GRANT ALL ON FUNCTION public.award_winner(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.award_winner(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.award_winner(uuid, integer) TO service_role;

CREATE FUNCTION public.big_two_call_one (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_seat integer; v_cards jsonb; v_called integer;
begin
  select p.seat into v_seat from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null;
  select cards into v_cards from public.big_two_player_hands where room_id=p_room_id and seat=v_seat for update;
  if v_seat is null or jsonb_array_length(coalesce(v_cards, '[]'::jsonb)) <> 1 then raise exception 'You can call 1 card only when one card remains'; end if;
  select coalesce((state->>'one_card_called_seat')::integer, 0) into v_called from public.big_two_match_state where room_id=p_room_id for update;
  if v_called = v_seat then return jsonb_build_object('seat',v_seat,'called',true,'already_called',true); end if;
  if v_called <> 0 then raise exception 'A 1 Card call is already active'; end if;
  update public.big_two_match_state set state=jsonb_set(state,'{one_card_called_seat}',to_jsonb(v_seat)), updated_at=now() where room_id=p_room_id and status='playing';
  return jsonb_build_object('seat',v_seat,'called',true);
end; $function$;

GRANT ALL ON FUNCTION public.big_two_call_one(uuid) TO anon;

GRANT ALL ON FUNCTION public.big_two_call_one(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_call_one(uuid) TO service_role;

CREATE FUNCTION public.big_two_deal_room (
  p_room_id      uuid,
  p_turn_seconds integer DEFAULT 30
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_host uuid;
  v_count integer;
  v_room_status text;
  v_deck jsonb;
  v_seat integer;
  v_starter integer := 1;
begin
  select host_id, status
  into v_host, v_room_status
  from public.matchmaking_rooms
  where id = p_room_id
  for update;

  select count(*)
  into v_count
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;

  if v_host is distinct from auth.uid() or v_count <> 4 then
    raise exception 'Only the host may deal a full four-player room';
  end if;

  if v_room_status <> 'starting' then
    raise exception 'This room has already been dealt or is not ready';
  end if;

  select jsonb_agg(
    jsonb_build_object('id', rank || '-' || suit, 'rank', rank, 'suit', suit)
    order by random()
  )
  into v_deck
  from generate_series(0, 12) r(rank)
  cross join generate_series(0, 3) s(suit);

  delete from public.big_two_player_hands where room_id = p_room_id;

  for v_seat in 1..4 loop
    insert into public.big_two_player_hands(room_id, seat, cards)
    select p_room_id, v_seat,
      jsonb_agg(v_deck -> (ordinality - 1) order by ordinality)
    from generate_series((v_seat - 1) * 13 + 1, v_seat * 13) ordinality;

    if exists (
      select 1
      from public.big_two_player_hands h,
           jsonb_array_elements(h.cards) c
      where h.room_id = p_room_id
        and h.seat = v_seat
        and (c->>'rank')::integer = 0
        and (c->>'suit')::integer = 0
    ) then
      v_starter := v_seat;
    end if;
  end loop;

  insert into public.big_two_match_state(
    room_id, state, current_seat, turn_deadline, status
  )
  values (
    p_room_id,
    jsonb_build_object(
      'hand_counts', jsonb_build_array(13, 13, 13, 13),
      'table_cards', '[]'::jsonb,
      'passes', 0,
      'opening_required', true,
      'free_lead', false,
      'one_card_called_seat', null,
      'last_play_seat', null,
      'winner_seat', null
    ),
    v_starter,
    now() + make_interval(secs => greatest(10, least(p_turn_seconds, 90))),
    'playing'
  )
  on conflict(room_id) do update
  set state = excluded.state,
      current_seat = excluded.current_seat,
      turn_deadline = excluded.turn_deadline,
      status = 'playing',
      updated_at = now();

  update public.matchmaking_rooms
  set status = 'playing'
  where id = p_room_id;

  -- Do not auto-play a bot opener here. It is deliberately handled by the
  -- visible, delayed resolver after the board has loaded.
  return jsonb_build_object('room_id', p_room_id, 'starter_seat', v_starter);
end;
$function$;

GRANT ALL ON FUNCTION public.big_two_deal_room(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.big_two_deal_room(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_deal_room(uuid, integer) TO service_role;

CREATE FUNCTION public.big_two_pass (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_seat integer; v_state jsonb; v_current integer; v_passes integer; v_next integer;
begin
  select p.seat into v_seat from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null;
  select state,current_seat into v_state,v_current from public.big_two_match_state where room_id=p_room_id and status='playing' for update;
  if v_seat is null or v_current is null then raise exception 'Match or seat not found'; end if;
  if v_seat <> v_current then raise exception 'It is not your turn'; end if;
  if jsonb_array_length(coalesce(v_state->'table_cards', '[]'::jsonb)) = 0 then raise exception 'You cannot pass on a new trick'; end if;
  if (select turn_deadline from public.big_two_match_state where room_id=p_room_id) < now() then raise exception 'Turn expired'; end if;
  v_passes := coalesce((v_state->>'passes')::integer,0) + 1;
  if v_passes >= 3 then
    v_next := coalesce((v_state->>'last_play_seat')::integer, v_current);
    -- Preserve the final winning cards on the table for the players to see.
    -- `free_lead` removes the requirement to beat them for the next trick.
    v_state := jsonb_set(jsonb_set(v_state,'{passes}','0'::jsonb),'{free_lead}','true'::jsonb);
    update public.big_two_match_state set current_seat=v_next, turn_deadline=now()+interval '30 seconds', state=v_state,updated_at=now() where room_id=p_room_id;
    return jsonb_build_object('current_seat',v_next,'passes',0,'new_trick',true);
  end if;
  v_next := (v_current % 4) + 1;
  update public.big_two_match_state set current_seat=v_next, turn_deadline=now()+interval '30 seconds', state=jsonb_set(v_state,'{passes}',to_jsonb(v_passes)),updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('current_seat',v_next,'passes',v_passes,'new_trick',false);
end; $function$;

GRANT ALL ON FUNCTION public.big_two_pass(uuid) TO anon;

GRANT ALL ON FUNCTION public.big_two_pass(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_pass(uuid) TO service_role;

CREATE FUNCTION public.big_two_play_cards (
  p_room_id uuid,
  p_cards   jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.big_two_play_cards(uuid, jsonb) TO anon;

GRANT ALL ON FUNCTION public.big_two_play_cards(uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_play_cards(uuid, jsonb) TO service_role;

CREATE FUNCTION public.big_two_start_match (
  p_room_id      uuid,
  p_turn_seconds integer DEFAULT 30
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_count integer; v_host uuid;
begin
  select host_id into v_host from public.matchmaking_rooms where id = p_room_id;
  select count(*) into v_count from public.matchmaking_room_players where room_id = p_room_id and left_at is null;
  if v_host is distinct from auth.uid() or v_count <> 4 then raise exception 'A four-player host room is required'; end if;
  update public.matchmaking_rooms set status = 'playing' where id = p_room_id;
  insert into public.big_two_match_state(room_id, status, current_seat, turn_deadline)
  values (p_room_id, 'playing', 1, now() + make_interval(secs => greatest(10, least(p_turn_seconds, 90))))
  on conflict (room_id) do update set status = 'playing', current_seat = 1, turn_deadline = excluded.turn_deadline, updated_at = now();
  return jsonb_build_object('room_id', p_room_id, 'current_seat', 1);
end;
$function$;

GRANT ALL ON FUNCTION public.big_two_start_match(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.big_two_start_match(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_start_match(uuid, integer) TO service_role;

CREATE FUNCTION public.big_two_timeout_turn (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_state jsonb;
  v_current integer;
  v_deadline timestamptz;
  v_bot boolean;
  v_hand jsonb;
  v_cards jsonb;
  v_remaining jsonb;
  v_next integer;
  v_table_count integer;
  v_table_power integer;
  v_candidate_rank integer;
begin
  select state, current_seat, turn_deadline
  into v_state, v_current, v_deadline
  from public.big_two_match_state
  where room_id = p_room_id and status = 'playing'
  for update;

  if v_current is null then
    return jsonb_build_object('advanced', false);
  end if;

  select is_bot
  into v_bot
  from public.matchmaking_room_players
  where room_id = p_room_id and seat = v_current and left_at is null;

  -- A real player keeps their turn until their deadline.
  if v_deadline > now() and not coalesce(v_bot, false) then
    return jsonb_build_object('advanced', false);
  end if;

  if not coalesce(v_bot, false) then
    update public.big_two_match_state
    set current_seat = (v_current % 4) + 1,
        turn_deadline = now() + interval '30 seconds',
        updated_at = now()
    where room_id = p_room_id;

    return jsonb_build_object('advanced', true, 'timed_out_human', true);
  end if;

  select cards
  into v_hand
  from public.big_two_player_hands
  where room_id = p_room_id and seat = v_current
  for update;

  v_table_count := jsonb_array_length(coalesce(v_state->'table_cards', '[]'::jsonb));
  v_cards := null;

  -- The opening play must contain 3♦. Playing it as a single is always legal.
  if coalesce((v_state->>'opening_required')::boolean, false) then
    select jsonb_build_array(card)
    into v_cards
    from jsonb_array_elements(v_hand) card
    where card->>'id' = '0-0'
    limit 1;

  -- A new trick: lead the lowest single card.
  elsif coalesce((v_state->>'free_lead')::boolean, false) or v_table_count = 0 then
    select jsonb_build_array(card)
    into v_cards
    from jsonb_array_elements(v_hand) card
    order by (card->>'rank')::integer, (card->>'suit')::integer
    limit 1;

  -- Beat a single with the lowest higher single.
  elsif v_table_count = 1 then
    select ((card->>'rank')::integer * 4 + (card->>'suit')::integer)
    into v_table_power
    from jsonb_array_elements(v_state->'table_cards') card
    limit 1;

    select jsonb_build_array(card)
    into v_cards
    from jsonb_array_elements(v_hand) card
    where ((card->>'rank')::integer * 4 + (card->>'suit')::integer) > v_table_power
    order by (card->>'rank')::integer, (card->>'suit')::integer
    limit 1;

  -- Beat a pair with the lowest higher pair.
  elsif v_table_count = 2 then
    select max((card->>'rank')::integer) * 4 + max((card->>'suit')::integer)
    into v_table_power
    from jsonb_array_elements(v_state->'table_cards') card;

    select ranked.rank
    into v_candidate_rank
    from (
      select (card->>'rank')::integer as rank,
             max((card->>'suit')::integer) as top_suit,
             count(*) as card_count
      from jsonb_array_elements(v_hand) card
      group by (card->>'rank')::integer
    ) ranked
    where ranked.card_count >= 2
      and ranked.rank * 4 + ranked.top_suit > v_table_power
    order by ranked.rank * 4 + ranked.top_suit
    limit 1;

    if v_candidate_rank is not null then
      select coalesce(jsonb_agg(card), '[]'::jsonb)
      into v_cards
      from (
        select card
        from jsonb_array_elements(v_hand) card
        where (card->>'rank')::integer = v_candidate_rank
        order by (card->>'suit')::integer
        limit 2
      ) chosen;
    end if;

  -- Beat a triple with the lowest higher triple.
  elsif v_table_count = 3 then
    select max((card->>'rank')::integer)
    into v_table_power
    from jsonb_array_elements(v_state->'table_cards') card;

    select ranked.rank
    into v_candidate_rank
    from (
      select (card->>'rank')::integer as rank, count(*) as card_count
      from jsonb_array_elements(v_hand) card
      group by (card->>'rank')::integer
    ) ranked
    where ranked.card_count >= 3 and ranked.rank > v_table_power
    order by ranked.rank
    limit 1;

    if v_candidate_rank is not null then
      select coalesce(jsonb_agg(card), '[]'::jsonb)
      into v_cards
      from (
        select card
        from jsonb_array_elements(v_hand) card
        where (card->>'rank')::integer = v_candidate_rank
        order by (card->>'suit')::integer
        limit 3
      ) chosen;
    end if;
  end if;

  -- Passing is valid when no legal response is available (including complex
  -- five-card hands, which the bot deliberately does not fake).
  if v_cards is null or jsonb_array_length(v_cards) = 0 then
    v_state := jsonb_set(v_state, '{passes}', to_jsonb(coalesce((v_state->>'passes')::integer, 0) + 1));
    if (v_state->>'passes')::integer >= 3 then
      v_state := jsonb_set(jsonb_set(v_state, '{passes}', '0'::jsonb), '{free_lead}', 'true'::jsonb);
      v_next := coalesce((v_state->>'last_play_seat')::integer, v_current);
    else
      v_next := (v_current % 4) + 1;
    end if;

    update public.big_two_match_state
    set state = v_state,
        current_seat = v_next,
        turn_deadline = now() + interval '30 seconds',
        updated_at = now()
    where room_id = p_room_id;

    return jsonb_build_object('advanced', true, 'bot_passed', true);
  end if;

  select coalesce(jsonb_agg(card), '[]'::jsonb)
  into v_remaining
  from jsonb_array_elements(v_hand) card
  where not exists (
    select 1
    from jsonb_array_elements(v_cards) played
    where played->>'id' = card->>'id'
  );

  v_next := (v_current % 4) + 1;

  update public.big_two_player_hands
  set cards = v_remaining, updated_at = now()
  where room_id = p_room_id and seat = v_current;

  v_state := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(v_state, '{table_cards}', v_cards),
            '{last_play_seat}', to_jsonb(v_current)
          ),
          '{passes}', '0'::jsonb
        ),
        '{opening_required}', 'false'::jsonb
      ),
      '{free_lead}', 'false'::jsonb
    ),
    array['hand_counts', (v_current - 1)::text],
    to_jsonb(jsonb_array_length(v_remaining))
  );

  if jsonb_array_length(v_remaining) = 0 then
    v_state := jsonb_set(v_state, '{winner_seat}', to_jsonb(v_current));
  end if;

  update public.big_two_match_state
  set state = v_state,
      current_seat = v_next,
      turn_deadline = now() + interval '30 seconds',
      status = case when jsonb_array_length(v_remaining) = 0 then 'completed' else 'playing' end,
      updated_at = now()
  where room_id = p_room_id;

  return jsonb_build_object('advanced', true, 'bot_played', v_cards);
end;
$function$;

GRANT ALL ON FUNCTION public.big_two_timeout_turn(uuid) TO anon;

GRANT ALL ON FUNCTION public.big_two_timeout_turn(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.big_two_timeout_turn(uuid) TO service_role;

CREATE FUNCTION public.bingo_draw_number (
  p_room_id          uuid,
  p_expected_version integer DEFAULT NULL::integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.bingo_draw_number(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.bingo_draw_number(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.bingo_draw_number(uuid, integer) TO service_role;

CREATE FUNCTION public.bingo_line_count (
  p_marked jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
declare v_total integer := 0;
begin
  if p_marked @> '[0,1,2,3,4]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[5,6,7,8,9]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[10,11,12,13,14]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[15,16,17,18,19]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[20,21,22,23,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[0,5,10,15,20]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[1,6,11,16,21]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[2,7,12,17,22]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[3,8,13,18,23]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[4,9,14,19,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[0,6,12,18,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[4,8,12,16,20]'::jsonb then v_total:=v_total+1; end if;
  return case when v_total > 0 then 5 else 0 end;
end $function$;

GRANT ALL ON FUNCTION public.bingo_line_count(jsonb) TO anon;

GRANT ALL ON FUNCTION public.bingo_line_count(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.bingo_line_count(jsonb) TO service_role;

CREATE FUNCTION public.bingo_mark_square (
  p_room_id          uuid,
  p_tile_index       integer,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.bingo_mark_square(uuid, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.bingo_mark_square(uuid, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.bingo_mark_square(uuid, integer, integer) TO service_role;

CREATE FUNCTION public.bingo_new_card()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_columns jsonb[] := array[]::jsonb[]; v_card jsonb := '[]'::jsonb; v_col integer; v_row integer; v_values jsonb;
begin
  for v_col in 0..4 loop
    select coalesce(jsonb_agg(number), '[]'::jsonb) into v_values
    from (
      select number from generate_series(v_col * 15 + 1, v_col * 15 + 15) number order by random() limit 5
    ) picks;
    v_columns := array_append(v_columns, v_values);
  end loop;
  for v_row in 0..4 loop
    for v_col in 0..4 loop
      if v_row=2 and v_col=2 then v_card := v_card || jsonb_build_array(null);
      else v_card := v_card || jsonb_build_array(v_columns[v_col+1] -> v_row);
      end if;
    end loop;
  end loop;
  return v_card;
end $function$;

GRANT ALL ON FUNCTION public.bingo_new_card() TO anon;

GRANT ALL ON FUNCTION public.bingo_new_card() TO authenticated;

GRANT ALL ON FUNCTION public.bingo_new_card() TO service_role;

CREATE FUNCTION public.bingo_set_auto_calling (
  p_room_id uuid,
  p_enabled boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.bingo_set_auto_calling(uuid, boolean) TO anon;

GRANT ALL ON FUNCTION public.bingo_set_auto_calling(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.bingo_set_auto_calling(uuid, boolean) TO service_role;

CREATE FUNCTION public.buy_cosmetic (
  p_user_id     uuid,
  p_cosmetic_id uuid,
  p_price       numeric
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_currency TEXT;
  v_user_points INT;
  v_user_gems INT;
  v_already_owned INT;
BEGIN
  -- 1. Check if user already owns this item
  SELECT COUNT(*) INTO v_already_owned
  FROM user_inventory
  WHERE user_id = p_user_id AND cosmetic_id = p_cosmetic_id;

  IF v_already_owned > 0 THEN
    RETURN TRUE;
  END IF;

  -- 2. Fetch the item's currency type from store_items
  SELECT price_currency INTO v_currency
  FROM store_items
  WHERE id = p_cosmetic_id;

  -- Fallback to 'gems' if not specified
  IF v_currency IS NULL THEN
    v_currency := 'gems';
  END IF;

  -- 3. Get user balances
  SELECT COALESCE(points, 0), COALESCE(gems, 0)
  INTO v_user_points, v_user_gems
  FROM profiles
  WHERE id = p_user_id;

  -- 4. Validate balance and deduct correct currency
  IF v_currency = 'points' THEN
    IF v_user_points < p_price THEN
      RETURN FALSE;
    END IF;

    UPDATE profiles
    SET points = points - p_price
    WHERE id = p_user_id;

  ELSIF v_currency = 'gems' THEN
    IF v_user_gems < p_price THEN
      RETURN FALSE;
    END IF;

    UPDATE profiles
    SET gems = gems - p_price
    WHERE id = p_user_id;

  ELSE
    RETURN FALSE;
  END IF;

  -- 5. Add unlocked item to user_inventory (Omitting created_at so the DB handles it automatically)
  INSERT INTO user_inventory (user_id, cosmetic_id, is_equipped)
  VALUES (p_user_id, p_cosmetic_id, FALSE);

  RETURN TRUE;
END;
$function$;

GRANT ALL ON FUNCTION public.buy_cosmetic(uuid, uuid, numeric) TO anon;

GRANT ALL ON FUNCTION public.buy_cosmetic(uuid, uuid, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.buy_cosmetic(uuid, uuid, numeric) TO service_role;

CREATE FUNCTION public.cancel_bingo_matchmaking()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.matchmaking_rooms r set status='cancelled'
  where r.game_key='bingo' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null);
end $function$;

GRANT ALL ON FUNCTION public.cancel_bingo_matchmaking() TO anon;

GRANT ALL ON FUNCTION public.cancel_bingo_matchmaking() TO authenticated;

GRANT ALL ON FUNCTION public.cancel_bingo_matchmaking() TO service_role;

CREATE FUNCTION public.cancel_dominoes_matchmaking()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ begin
  update public.matchmaking_rooms r set status='cancelled' where r.game_key='dominoes' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null);
end $function$;

GRANT ALL ON FUNCTION public.cancel_dominoes_matchmaking() TO anon;

GRANT ALL ON FUNCTION public.cancel_dominoes_matchmaking() TO authenticated;

GRANT ALL ON FUNCTION public.cancel_dominoes_matchmaking() TO service_role;

CREATE FUNCTION public.cancel_four_in_a_row_matchmaking()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin update public.matchmaking_rooms r set status='cancelled' where r.game_key='four-in-a-row' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null); end $function$;

GRANT ALL ON FUNCTION public.cancel_four_in_a_row_matchmaking() TO anon;

GRANT ALL ON FUNCTION public.cancel_four_in_a_row_matchmaking() TO authenticated;

GRANT ALL ON FUNCTION public.cancel_four_in_a_row_matchmaking() TO service_role;

CREATE FUNCTION public.cancel_waiting_monopoly_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_status text; v_entry bigint;
begin
 select status into v_status from public.matchmaking_rooms where id=p_room_id for update;
 if v_status is distinct from 'waiting' then raise exception 'Only a waiting Monopoly room can be cancelled'; end if;
 select entry_points into v_entry from public.monopoly_match_escrow where room_id=p_room_id and user_id=auth.uid() for update;
 if v_entry is not null then
   update public.profiles set points=points+v_entry where id=auth.uid();
   delete from public.monopoly_match_escrow where room_id=p_room_id and user_id=auth.uid();
 end if;
 update public.matchmaking_room_players set left_at=now() where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and left_at is null) then
   update public.matchmaking_rooms set status='cancelled' where id=p_room_id;
 end if;
 return jsonb_build_object('cancelled',true,'refunded_points',coalesce(v_entry,0));
end; $function$;

GRANT ALL ON FUNCTION public.cancel_waiting_monopoly_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.cancel_waiting_monopoly_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cancel_waiting_monopoly_room(uuid) TO service_role;

CREATE FUNCTION public.check_match_status (
  p_ticket_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_ticket RECORD;
BEGIN
  SELECT * INTO v_ticket
  FROM public.matchmaking_queue
  WHERE id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'status', v_ticket.status,
    'match_id', v_ticket.match_id,
    'role', v_ticket.role,
    'opponent_name', v_ticket.opponent_name
  );
END;
$function$;

GRANT ALL ON FUNCTION public.check_match_status(uuid) TO anon;

GRANT ALL ON FUNCTION public.check_match_status(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.check_match_status(uuid) TO service_role;

CREATE FUNCTION public.complete_tournament (
  target_tournament uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare event public.tournaments; entrant public.tournament_entries; award public.tournament_awards;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then raise exception 'Admin access required'; end if;
  select * into event from public.tournaments where id = target_tournament for update;
  if not found or event.status = 'completed' then raise exception 'Tournament cannot be completed'; end if;

  with standings as (
    select id, dense_rank() over (order by score desc, wins desc, losses asc, matches_played desc, joined_at asc) as final_rank
    from public.tournament_entries where tournament_id = target_tournament
  ) update public.tournament_entries e set placement = standings.final_rank from standings where e.id = standings.id;

  for entrant in select * from public.tournament_entries where tournament_id = target_tournament loop
    select * into award from public.tournament_awards where tournament_id = target_tournament and placement = entrant.placement;
    perform set_config('app.wallet_activity_type', 'tournament_reward', true);
    perform set_config('app.wallet_activity_description', 'Tournament reward: ' || event.title || ' (rank ' || entrant.placement || ')', true);
    if coalesce(award.points, 0) + coalesce(event.participation_points, 0) > 0 then update public.profiles set points = coalesce(points, 0) + coalesce(award.points, 0) + coalesce(event.participation_points, 0) where id = entrant.user_id; end if;
    if coalesce(award.gems, 0) + coalesce(event.participation_gems, 0) > 0 then update public.profiles set gems = coalesce(gems, 0) + coalesce(award.gems, 0) + coalesce(event.participation_gems, 0) where id = entrant.user_id; end if;
    if event.participation_badge_id is not null then insert into public.user_badges(user_id, badge_id, source, source_id) values(entrant.user_id, event.participation_badge_id, 'tournament_participation', target_tournament) on conflict do nothing; end if;
    if award.badge_id is not null then insert into public.user_badges(user_id, badge_id, source, source_id) values(entrant.user_id, award.badge_id, 'tournament_placement', target_tournament) on conflict do nothing; end if;
    update public.tournament_entries set status = case when entrant.placement = 1 then 'winner' else 'participated' end, completed_at = now() where id = entrant.id;
  end loop;
  update public.tournaments set status = 'completed' where id = target_tournament;
end;
$function$;

GRANT ALL ON FUNCTION public.complete_tournament(uuid) TO anon;

GRANT ALL ON FUNCTION public.complete_tournament(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.complete_tournament(uuid) TO service_role;

CREATE FUNCTION public.convert_points_to_gems (
  p_user_id     uuid,
  p_points_cost integer,
  p_gems_reward integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF (SELECT points FROM profiles WHERE id = p_user_id) >= p_points_cost THEN
    UPDATE profiles SET points = points - p_points_cost, gems = gems + p_gems_reward WHERE id = p_user_id;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$function$;

GRANT ALL ON FUNCTION public.convert_points_to_gems(uuid, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.convert_points_to_gems(uuid, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.convert_points_to_gems(uuid, integer, integer) TO service_role;

CREATE FUNCTION public.create_four_in_a_row_state (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then raise exception 'Not a room player'; end if;
  update public.two_player_game_state set state=jsonb_build_object('board',public.four_in_a_row_empty_board(),'winner_seat',null,'draw',false),current_seat=1,version=version+1,updated_at=now()
  where room_id=p_room_id and game_key='four-in-a-row';
  return jsonb_build_object('room_id',p_room_id);
end $function$;

GRANT ALL ON FUNCTION public.create_four_in_a_row_state(uuid) TO anon;

GRANT ALL ON FUNCTION public.create_four_in_a_row_state(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.create_four_in_a_row_state(uuid) TO service_role;

CREATE FUNCTION public.create_four_player_host_room (
  p_game_key   text,
  p_name       text,
  p_avatar_url text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.create_four_player_host_room(text, text, text) TO anon;

GRANT ALL ON FUNCTION public.create_four_player_host_room(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.create_four_player_host_room(text, text, text) TO service_role;

CREATE FUNCTION public.create_tournament_round (
  target_tournament uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  event public.tournaments;
  next_round integer;
  selected_game text;
  created_count integer := 0;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then
    raise exception 'Admin access required';
  end if;
  select * into event from public.tournaments where id = target_tournament for update;
  if not found then raise exception 'Tournament not found'; end if;
  if event.status not in ('upcoming', 'active') then raise exception 'Tournament is not available for fixtures'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = target_tournament and status in ('scheduled', 'in_progress')) then
    raise exception 'Complete or cancel the current round before creating another';
  end if;

  next_round := event.current_round + 1;
  selected_game := coalesce(event.games[1 + mod(next_round - 1, greatest(cardinality(event.games), 1))], event.game_title);
  if selected_game is null or selected_game = '' then raise exception 'Add at least one tournament game first'; end if;

  with seeded as (
    select user_id, row_number() over (order by score desc, wins desc, losses asc, joined_at asc) as slot
    from public.tournament_entries where tournament_id = target_tournament and status = 'registered'
  ), pairs as (
    select a.user_id as player_one_id, b.user_id as player_two_id
    from seeded a join seeded b on b.slot = a.slot + 1
    where mod(a.slot, 2) = 1
  )
  insert into public.tournament_matches(tournament_id, round_number, game_name, player_one_id, player_two_id)
  select target_tournament, next_round, selected_game, player_one_id, player_two_id from pairs;
  get diagnostics created_count = row_count;
  if created_count = 0 then raise exception 'At least two registered players are required'; end if;
  update public.tournaments set current_round = next_round, status = 'active' where id = target_tournament;
  return created_count;
end;
$function$;

GRANT ALL ON FUNCTION public.create_tournament_round(uuid) TO anon;

GRANT ALL ON FUNCTION public.create_tournament_round(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.create_tournament_round(uuid) TO service_role;

CREATE FUNCTION public.create_two_player_room (
  p_game_key text,
  p_name     text,
  p_state    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room uuid; v_code text;
begin
  if lower(p_game_key) not in ('bingo','four-in-a-row','dominoes') then raise exception 'Unsupported two-player game'; end if;
  v_code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at)
  values(lower(p_game_key),v_code,2,auth.uid(),false,now()+interval '24 hours') returning id into v_room;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room,auth.uid(),1,coalesce(nullif(p_name,''),'Player 1'),true);
  insert into public.two_player_game_state(room_id,game_key,state) values(v_room,lower(p_game_key),p_state);
  return jsonb_build_object('room_id',v_room,'room_code',v_code,'seat',1);
end $function$;

GRANT ALL ON FUNCTION public.create_two_player_room(text, text, jsonb) TO anon;

GRANT ALL ON FUNCTION public.create_two_player_room(text, text, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.create_two_player_room(text, text, jsonb) TO service_role;

CREATE FUNCTION public.create_wallet_activity_notification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.user_notifications(user_id, title, message, kind, category)
  values (
    new.user_id,
    case when new.amount >= 0 then 'Wallet credited' else 'Wallet debited' end,
    coalesce(new.description, 'Wallet activity') || ': ' || case when new.amount >= 0 then '+' else '' end || new.amount || ' ' || upper(new.currency_type),
    'wallet_activity',
    'system'
  );
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.create_wallet_activity_notification() TO anon;

GRANT ALL ON FUNCTION public.create_wallet_activity_notification() TO authenticated;

GRANT ALL ON FUNCTION public.create_wallet_activity_notification() TO service_role;

CREATE FUNCTION public.deduct_entry_fee (
  user_id   uuid,
  entry_fee integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  AS $function$
begin
  -- Check if the user has enough points
  if (select points from users where id = user_id) >= entry_fee then
    -- Deduct the points
    update users set points = points - entry_fee where id = user_id;
    return true;
  else
    return false; -- Not enough points
  end if;
end;
$function$;

GRANT ALL ON FUNCTION public.deduct_entry_fee(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.deduct_entry_fee(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.deduct_entry_fee(uuid, integer) TO service_role;

CREATE FUNCTION public.diagnose_bingo_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state public.two_player_game_state;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo';
  if v_state.room_id is null then return jsonb_build_object('ok',false,'message','Bingo game state was not found'); end if;
  return jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'room_status', v_state.status,
    'version', v_state.version,
    'state', v_state.state,
    'card_count', (select count(*) from public.bingo_match_cards where room_id=p_room_id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',display_name,'is_bot',is_bot)),'[]'::jsonb) from public.matchmaking_room_players where room_id=p_room_id and left_at is null)
  );
exception when others then
  return jsonb_build_object('ok',false,'sqlstate',SQLSTATE,'message',SQLERRM,'detail',PG_EXCEPTION_DETAIL,'hint',PG_EXCEPTION_HINT);
end $function$;

GRANT ALL ON FUNCTION public.diagnose_bingo_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.diagnose_bingo_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.diagnose_bingo_room(uuid) TO service_role;

CREATE FUNCTION public.dominoes_draw_or_pass (
  p_room_id          uuid,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.two_player_game_state; seat_no smallint; v_hand jsonb; pile jsonb; tile jsonb; passes int; p1 int; p2 int; winner_no smallint;
begin
 select * into s from public.two_player_game_state where room_id=p_room_id and game_key='dominoes' for update;
 select seat into seat_no from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 if s.room_id is null or seat_no is null or s.status<>'playing' or s.current_seat<>seat_no then raise exception 'Not your turn'; end if;
 if s.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
 select d.hand into v_hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=seat_no;
 if exists(select 1 from jsonb_array_elements(v_hand) t where public.dominoes_tile_playable(t,s.state->'board')) then raise exception 'You have a playable domino'; end if;
 pile:=coalesce(s.state->'draw_pile','[]'::jsonb);
 if jsonb_array_length(pile)>0 then
   tile:=pile->0;
   update public.dominoes_match_hands d set hand=v_hand||jsonb_build_array(tile) where d.room_id=p_room_id and d.seat=seat_no;
   update public.two_player_game_state set state=jsonb_set(s.state,'{draw_pile}',pile-0),version=version+1,updated_at=now() where room_id=p_room_id;
   return jsonb_build_object('drew',true);
 end if;
 passes:=coalesce((s.state->>'passes')::int,0)+1;
 if passes>=2 then
   select coalesce(sum((value->>'left')::int+(value->>'right')::int),0) into p1 from jsonb_array_elements((select d.hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=1));
   select coalesce(sum((value->>'left')::int+(value->>'right')::int),0) into p2 from jsonb_array_elements((select d.hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=2));
   winner_no:=case when p1<p2 then 1 when p2<p1 then 2 else null end;
   update public.two_player_game_state set state=jsonb_set(jsonb_set(s.state,'{passes}',to_jsonb(passes)),'{winner_seat}',to_jsonb(winner_no)),status='completed',version=version+1,updated_at=now() where room_id=p_room_id;
   update public.matchmaking_rooms set status='completed' where id=p_room_id;
   return jsonb_build_object('blocked',true,'winner_seat',winner_no);
 end if;
 update public.two_player_game_state set state=jsonb_set(s.state,'{passes}',to_jsonb(passes)),current_seat=case when seat_no=1 then 2 else 1 end,version=version+1,updated_at=now() where room_id=p_room_id;
 perform public.resolve_dominoes_bot_turn(p_room_id);
 return jsonb_build_object('passed',true);
end $function$;

GRANT ALL ON FUNCTION public.dominoes_draw_or_pass(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.dominoes_draw_or_pass(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.dominoes_draw_or_pass(uuid, integer) TO service_role;

CREATE FUNCTION public.dominoes_play (
  p_room_id          uuid,
  p_tile_id          text,
  p_side             text,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.two_player_game_state; seat_no smallint; v_hand jsonb; tile jsonb; board jsonb; left_end int; right_end int; a int; b int; reversed boolean:=false; played jsonb; next_hand jsonb; won boolean;
begin
 select * into s from public.two_player_game_state where room_id=p_room_id and game_key='dominoes' for update;
 select seat into seat_no from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 if s.room_id is null or seat_no is null or s.status<>'playing' or s.current_seat<>seat_no then raise exception 'Not your turn'; end if;
 if s.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
 select d.hand into v_hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=seat_no;
 select value into tile from jsonb_array_elements(v_hand) value where value->>'id'=p_tile_id;
 if tile is null then raise exception 'Tile not in your hand'; end if;
 board:=coalesce(s.state->'board','[]'::jsonb); a:=(tile->>'left')::int; b:=(tile->>'right')::int;
 if jsonb_array_length(board)=0 then
   if p_tile_id is distinct from s.state->>'opening_tile_id' then raise exception 'Play the opening double first'; end if;
   played:=tile||jsonb_build_object('reversed',false,'playedSide','start'); board:=jsonb_build_array(played);
 else
   left_end:=case when coalesce((board->0->>'reversed')::boolean,false) then (board->0->>'right')::int else (board->0->>'left')::int end;
   right_end:=case when coalesce((board->-1->>'reversed')::boolean,false) then (board->-1->>'left')::int else (board->-1->>'right')::int end;
   if p_side='left' then
     if b=left_end then reversed:=false; elsif a=left_end then reversed:=true; else raise exception 'Tile does not match the left end'; end if;
   elsif p_side='right' then
     if a=right_end then reversed:=false; elsif b=right_end then reversed:=true; else raise exception 'Tile does not match the right end'; end if;
   else raise exception 'Choose left or right'; end if;
   played:=tile||jsonb_build_object('reversed',reversed,'playedSide',p_side);
   board:=case when p_side='left' then jsonb_build_array(played)||board else board||jsonb_build_array(played) end;
 end if;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into next_hand from jsonb_array_elements(v_hand) value where value->>'id'<>p_tile_id;
 won:=jsonb_array_length(next_hand)=0;
 update public.dominoes_match_hands set hand=next_hand where room_id=p_room_id and seat=seat_no;
 update public.two_player_game_state set state=jsonb_set(jsonb_set(jsonb_set(s.state,'{board}',board),'{passes}','0'::jsonb),'{winner_seat}',case when won then to_jsonb(seat_no) else 'null'::jsonb end),current_seat=case when won then seat_no else case when seat_no=1 then 2 else 1 end end,status=case when won then 'completed' else 'playing' end,version=version+1,updated_at=now() where room_id=p_room_id;
 if won then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
 if not won then perform public.resolve_dominoes_bot_turn(p_room_id); end if;
 return jsonb_build_object('played',true,'winner_seat',case when won then seat_no else null end);
end $function$;

GRANT ALL ON FUNCTION public.dominoes_play(uuid, text, text, integer) TO anon;

GRANT ALL ON FUNCTION public.dominoes_play(uuid, text, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.dominoes_play(uuid, text, text, integer) TO service_role;

CREATE FUNCTION public.dominoes_tile_playable (
  p_tile  jsonb,
  p_board jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  with board_ends as (
    select
      case
        when coalesce((p_board -> 0 ->> 'reversed')::boolean, false)
          then (p_board -> 0 ->> 'right')::integer
        else (p_board -> 0 ->> 'left')::integer
      end as left_end,
      case
        when coalesce((p_board -> -1 ->> 'reversed')::boolean, false)
          then (p_board -> -1 ->> 'left')::integer
        else (p_board -> -1 ->> 'right')::integer
      end as right_end
  )
  select
    jsonb_array_length(coalesce(p_board, '[]'::jsonb)) = 0
    or (p_tile ->> 'left')::integer in (select left_end from board_ends union all select right_end from board_ends)
    or (p_tile ->> 'right')::integer in (select left_end from board_ends union all select right_end from board_ends)
$function$;

GRANT ALL ON FUNCTION public.dominoes_tile_playable(jsonb, jsonb) TO anon;

GRANT ALL ON FUNCTION public.dominoes_tile_playable(jsonb, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.dominoes_tile_playable(jsonb, jsonb) TO service_role;

CREATE FUNCTION public.enforce_big_two_winner()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_winner smallint;
begin
  if new.status = 'completed' then
    select seat into v_winner
    from public.big_two_player_hands
    where room_id = new.room_id and jsonb_array_length(cards) = 0
    order by seat
    limit 1;
    if v_winner is not null then
      new.state := jsonb_set(coalesce(new.state,'{}'::jsonb), '{winner_seat}', to_jsonb(v_winner));
    end if;
  end if;
  return new;
end; $function$;

GRANT ALL ON FUNCTION public.enforce_big_two_winner() TO anon;

GRANT ALL ON FUNCTION public.enforce_big_two_winner() TO authenticated;

GRANT ALL ON FUNCTION public.enforce_big_two_winner() TO service_role;

CREATE FUNCTION public.ensure_my_profile()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  account auth.users;
  base_username text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into account from auth.users where id = auth.uid();
  if not found then raise exception 'Authenticated account not found'; end if;

  base_username := lower(regexp_replace(coalesce(account.raw_user_meta_data ->> 'preferred_username', account.raw_user_meta_data ->> 'user_name', account.raw_user_meta_data ->> 'name', split_part(coalesce(account.email, 'player'), '@', 1), 'player'), '[^a-zA-Z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);
  if char_length(base_username) < 3 then base_username := 'player'; end if;

  insert into public.profiles (id, email, username, avatar_url)
  values (account.id, account.email, left(base_username, 20) || '_' || substr(account.id::text, 1, 6), coalesce(account.raw_user_meta_data ->> 'avatar_url', account.raw_user_meta_data ->> 'picture'))
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
end;
$function$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;

GRANT ALL ON FUNCTION public.ensure_my_profile() TO anon;

GRANT ALL ON FUNCTION public.ensure_my_profile() TO authenticated;

GRANT ALL ON FUNCTION public.ensure_my_profile() TO service_role;

CREATE FUNCTION public.enter_competitive_match (
  p_game_title    text,
  p_entry_fee     integer,
  p_opponent_name text    DEFAULT 'Online Opponent'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_stake public.competitive_match_stakes;
  v_points integer;
  v_fee integer := greatest(coalesce(p_entry_fee, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Sign in to enter a competitive match';
  end if;

  -- Repeated UI events, reconnection, and the host's later Enter button must
  -- reuse the same active stake instead of charging a second time.
  select * into v_stake
  from public.competitive_match_stakes
  where user_id = auth.uid()
    and game_title = coalesce(nullif(trim(p_game_title), ''), 'Arena Game')
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_stake.id is not null then
    select coalesce(points, 0) into v_points from public.profiles where id = auth.uid();
    return jsonb_build_object(
      'success', true,
      'stake_id', v_stake.id,
      'match_id', v_stake.id,
      'new_points', v_points,
      'reused', true
    );
  end if;

  select coalesce(points, 0) into v_points
  from public.profiles
  where id = auth.uid()
  for update;

  if v_points < v_fee then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.profiles
  set points = coalesce(points, 0) - v_fee
  where id = auth.uid()
  returning points into v_points;

  insert into public.competitive_match_stakes(user_id, game_title, opponent_name, entry_fee)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_game_title), ''), 'Arena Game'),
    coalesce(nullif(trim(p_opponent_name), ''), 'Online Opponent'),
    v_fee
  )
  returning * into v_stake;

  return jsonb_build_object(
    'success', true,
    'stake_id', v_stake.id,
    'match_id', v_stake.id,
    'new_points', v_points,
    'reused', false
  );
end;
$function$;

GRANT ALL ON FUNCTION public.enter_competitive_match(text, integer, text) TO anon;

GRANT ALL ON FUNCTION public.enter_competitive_match(text, integer, text) TO authenticated;

GRANT ALL ON FUNCTION public.enter_competitive_match(text, integer, text) TO service_role;

CREATE FUNCTION public.equip_cosmetic (
  p_user_id     uuid,
  p_cosmetic_id uuid,
  p_category    text
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  -- Unequip all cosmetics of the same game category for this user
  UPDATE user_inventory ui
  SET is_equipped = false
  FROM cosmetics c
  WHERE ui.cosmetic_id = c.id 
  AND ui.user_id = p_user_id 
  AND c.game_category = p_category;

  -- Equip the target cosmetic
  UPDATE user_inventory
  SET is_equipped = true
  WHERE user_id = p_user_id AND cosmetic_id = p_cosmetic_id;
END;
$function$;

GRANT ALL ON FUNCTION public.equip_cosmetic(uuid, uuid, text) TO anon;

GRANT ALL ON FUNCTION public.equip_cosmetic(uuid, uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.equip_cosmetic(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.expire_points_by_policy (
  p_force boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  cfg jsonb;
  last_run timestamptz;
  interval_due interval;
  affected integer := 0;
  retained numeric;
  floor_balance integer;
  next_schedule text;
begin
  -- Browser calls are limited to administrators. Service-role cron calls have
  -- no auth.uid() and are allowed to run the due-date check.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')
  ) then
    raise exception 'Only administrators can run point expiry';
  end if;
  select value into cfg from public.system_settings where key = 'points_expiry_config';
  cfg := coalesce(cfg, '{"enabled":false}'::jsonb);
  if not coalesce((cfg->>'enabled')::boolean, false) and not p_force then
    return jsonb_build_object('status', 'disabled', 'affected_users', 0);
  end if;

  next_schedule := coalesce(cfg->>'schedule', 'quarterly');
  if next_schedule = 'manual' and not p_force then
    return jsonb_build_object('status', 'manual', 'affected_users', 0);
  end if;
  interval_due := case next_schedule when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '3 months' end;
  select nullif(value #>> '{}', '')::timestamptz into last_run from public.system_settings where key = 'last_points_expiry_at';
  if not p_force and last_run is not null and now() < last_run + interval_due then
    return jsonb_build_object('status', 'not_due', 'affected_users', 0, 'next_run_at', last_run + interval_due);
  end if;

  retained := greatest(0, least(100, coalesce((cfg->>'retention_percent')::numeric, 0)));
  floor_balance := greatest(0, coalesce((cfg->>'minimum_balance')::integer, 0));
  perform set_config('app.wallet_activity_type', 'points_expiry', true);
  perform set_config('app.wallet_activity_description', 'Scheduled point expiry', true);
  with changed as (
    update public.profiles
    set points = greatest(floor_balance, floor(coalesce(points, 0) * retained / 100.0)::integer)
    where coalesce(points, 0) > greatest(floor_balance, floor(coalesce(points, 0) * retained / 100.0)::integer)
    returning id
  ) select count(*) into affected from changed;
  insert into public.system_settings (key, value, updated_at)
  values ('last_points_expiry_at', to_jsonb(now()::text), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return jsonb_build_object('status', 'expired', 'affected_users', affected, 'retention_percent', retained, 'minimum_balance', floor_balance, 'expired_at', now());
end;
$function$;

REVOKE ALL ON FUNCTION public.expire_points_by_policy(boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.expire_points_by_policy(boolean) TO anon;

GRANT ALL ON FUNCTION public.expire_points_by_policy(boolean) TO authenticated;

GRANT ALL ON FUNCTION public.expire_points_by_policy(boolean) TO service_role;

CREATE FUNCTION public.fill_bingo_match_with_bot (
  p_name text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.fill_bingo_match_with_bot(text) TO anon;

GRANT ALL ON FUNCTION public.fill_bingo_match_with_bot(text) TO authenticated;

GRANT ALL ON FUNCTION public.fill_bingo_match_with_bot(text) TO service_role;

CREATE FUNCTION public.fill_dominoes_match_with_bot (
  p_name text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare r public.matchmaking_rooms; n text;
begin
  select mr.* into r from public.matchmaking_rooms mr join public.matchmaking_room_players p on p.room_id=mr.id where mr.game_key='dominoes' and mr.status='waiting' and mr.created_at<=now()-interval '45 seconds' and p.user_id=auth.uid() and p.left_at is null order by mr.created_at desc limit 1 for update;
  if r.id is null then raise exception 'The 45-second player search is still active'; end if;
  n:=(array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(r.id,2,n,true,true);
  update public.matchmaking_rooms set status='playing' where id=r.id;
  update public.two_player_game_state set status='playing',current_seat=1,updated_at=now() where room_id=r.id and game_key='dominoes';
  return jsonb_build_object('room_id',r.id,'seat',1,'opponent_name',n);
end $function$;

GRANT ALL ON FUNCTION public.fill_dominoes_match_with_bot(text) TO anon;

GRANT ALL ON FUNCTION public.fill_dominoes_match_with_bot(text) TO authenticated;

GRANT ALL ON FUNCTION public.fill_dominoes_match_with_bot(text) TO service_role;

CREATE FUNCTION public.fill_expired_four_player_bots (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room public.matchmaking_rooms; v_humans integer; v_seat integer; v_bot_names text[] := array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike']; v_index integer:=1;
begin
 select * into v_room from public.matchmaking_rooms where id=p_room_id for update;
 if v_room.id is null or v_room.max_players<>4 or v_room.expires_at>now() or v_room.status<>'waiting' then return jsonb_build_object('filled',false); end if;
 select count(*) filter(where not is_bot) into v_humans from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
 if v_humans<1 then return jsonb_build_object('filled',false,'reason','waiting for a player'); end if;
 for v_seat in 1..4 loop
   if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and seat=v_seat and left_at is null) then
     insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(p_room_id,v_seat,v_bot_names[v_index],true,true); v_index:=v_index+1;
   end if;
 end loop;
 if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and not is_bot and not ready and left_at is null) then update public.matchmaking_rooms set status='starting' where id=p_room_id; end if;
 return jsonb_build_object('filled',true);
end; $function$;

GRANT ALL ON FUNCTION public.fill_expired_four_player_bots(uuid) TO anon;

GRANT ALL ON FUNCTION public.fill_expired_four_player_bots(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fill_expired_four_player_bots(uuid) TO service_role;

CREATE FUNCTION public.fill_four_in_a_row_match_with_bot (
  p_name text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room public.matchmaking_rooms; v_name text;
begin
  select r.* into v_room from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id=r.id where r.game_key='four-in-a-row' and r.status='waiting' and r.created_at<=now()-interval '45 seconds' and p.user_id=auth.uid() and p.left_at is null order by r.created_at desc limit 1 for update;
  if v_room.id is null then raise exception 'The 45-second player search is still active'; end if;
  v_name:=(array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(v_room.id,2,v_name,true,true);
  perform public.start_four_in_a_row_match(v_room.id);
  return jsonb_build_object('room_id',v_room.id,'seat',1,'opponent_name',v_name);
end $function$;

GRANT ALL ON FUNCTION public.fill_four_in_a_row_match_with_bot(text) TO anon;

GRANT ALL ON FUNCTION public.fill_four_in_a_row_match_with_bot(text) TO authenticated;

GRANT ALL ON FUNCTION public.fill_four_in_a_row_match_with_bot(text) TO service_role;

CREATE FUNCTION public.four_in_a_row_apply (
  p_board  jsonb,
  p_column integer,
  p_seat   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
declare r integer;
begin
  r := public.four_in_a_row_open_row(p_board,p_column);
  if r < 0 then return p_board; end if;
  return jsonb_set(p_board,array[r::text,p_column::text],to_jsonb(p_seat),true);
end $function$;

GRANT ALL ON FUNCTION public.four_in_a_row_apply(jsonb, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.four_in_a_row_apply(jsonb, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.four_in_a_row_apply(jsonb, integer, integer) TO service_role;

CREATE FUNCTION public.four_in_a_row_empty_board()
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select '[[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null]]'::jsonb
$function$;

GRANT ALL ON FUNCTION public.four_in_a_row_empty_board() TO anon;

GRANT ALL ON FUNCTION public.four_in_a_row_empty_board() TO authenticated;

GRANT ALL ON FUNCTION public.four_in_a_row_empty_board() TO service_role;

CREATE FUNCTION public.four_in_a_row_has_four (
  p_board jsonb,
  p_seat  integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
declare r integer; c integer;
begin
  for r in 0..5 loop
    for c in 0..6 loop
      if p_board->r->>c is distinct from p_seat::text then continue; end if;
      if c <= 3 and p_board->r->>(c+1)=p_seat::text and p_board->r->>(c+2)=p_seat::text and p_board->r->>(c+3)=p_seat::text then return true; end if;
      if r <= 2 and p_board->(r+1)->>c=p_seat::text and p_board->(r+2)->>c=p_seat::text and p_board->(r+3)->>c=p_seat::text then return true; end if;
      if r <= 2 and c <= 3 and p_board->(r+1)->>(c+1)=p_seat::text and p_board->(r+2)->>(c+2)=p_seat::text and p_board->(r+3)->>(c+3)=p_seat::text then return true; end if;
      if r <= 2 and c >= 3 and p_board->(r+1)->>(c-1)=p_seat::text and p_board->(r+2)->>(c-2)=p_seat::text and p_board->(r+3)->>(c-3)=p_seat::text then return true; end if;
    end loop;
  end loop;
  return false;
end $function$;

GRANT ALL ON FUNCTION public.four_in_a_row_has_four(jsonb, integer) TO anon;

GRANT ALL ON FUNCTION public.four_in_a_row_has_four(jsonb, integer) TO authenticated;

GRANT ALL ON FUNCTION public.four_in_a_row_has_four(jsonb, integer) TO service_role;

CREATE FUNCTION public.four_in_a_row_move (
  p_room_id          uuid,
  p_column           integer,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.four_in_a_row_move(uuid, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.four_in_a_row_move(uuid, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.four_in_a_row_move(uuid, integer, integer) TO service_role;

CREATE FUNCTION public.four_in_a_row_open_row (
  p_board  jsonb,
  p_column integer
)
  RETURNS integer
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
declare r integer;
begin
  -- In PL/pgSQL REVERSE requires descending bounds. `REVERSE 0..5`
  -- executes zero iterations, which made every column look full.
  for r in reverse 5..0 loop
    if p_board->r->>p_column is null then return r; end if;
  end loop;
  return -1;
end $function$;

GRANT ALL ON FUNCTION public.four_in_a_row_open_row(jsonb, integer) TO anon;

GRANT ALL ON FUNCTION public.four_in_a_row_open_row(jsonb, integer) TO authenticated;

GRANT ALL ON FUNCTION public.four_in_a_row_open_row(jsonb, integer) TO service_role;

CREATE FUNCTION public.four_player_entry_fee (
  p_game_key text
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select greatest(coalesce((
    select entry_fee::integer
    from public.games
    where lower(title) = case lower(p_game_key)
      when 'big-two' then 'big two'
      else lower(p_game_key)
    end
    limit 1
  ), 0), 0);
$function$;

GRANT ALL ON FUNCTION public.four_player_entry_fee(text) TO anon;

GRANT ALL ON FUNCTION public.four_player_entry_fee(text) TO authenticated;

GRANT ALL ON FUNCTION public.four_player_entry_fee(text) TO service_role;

CREATE FUNCTION public.fund_four_player_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_game_key text;
  v_is_member boolean;
  v_is_bot boolean;
  v_entry_fee integer;
  v_points integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to enter this match';
  end if;

  select r.game_key, p.is_bot
  into v_game_key, v_is_bot
  from public.matchmaking_rooms r
  join public.matchmaking_room_players p on p.room_id = r.id
  where r.id = p_room_id
    and p.user_id = auth.uid()
    and p.left_at is null
  for update of r, p;

  v_is_member := found;
  if not v_is_member or coalesce(v_is_bot, false) then
    raise exception 'Only a human player in this room can fund it';
  end if;

  if v_game_key = 'monopoly' then
    return public.fund_monopoly_room(p_room_id);
  end if;
  if v_game_key not in ('big-two', 'ludo') then
    raise exception 'This is not a supported four-player room';
  end if;

  if exists (
    select 1 from public.four_player_match_escrow
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    return jsonb_build_object('funded', true, 'already_funded', true);
  end if;

  select coalesce(g.entry_fee, 0)::integer
  into v_entry_fee
  from public.games g
  where lower(g.title) = case v_game_key
    when 'big-two' then 'big two'
    else v_game_key
  end
  limit 1;
  v_entry_fee := greatest(coalesce(v_entry_fee, 0), 0);

  select coalesce(points, 0)
  into v_points
  from public.profiles
  where id = auth.uid()
  for update;
  if v_points < v_entry_fee then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.profiles
  set points = coalesce(points, 0) - v_entry_fee
  where id = auth.uid();

  insert into public.four_player_match_escrow(room_id, user_id, entry_points)
  values (p_room_id, auth.uid(), v_entry_fee);

  return jsonb_build_object('funded', true, 'entry_points', v_entry_fee);
end;
$function$;

GRANT ALL ON FUNCTION public.fund_four_player_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.fund_four_player_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fund_four_player_room(uuid) TO service_role;

CREATE FUNCTION public.fund_monopoly_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_fee bigint; v_balance bigint; v_game text;
begin
 select game_key into v_game from public.matchmaking_rooms where id=p_room_id for update;
 if v_game <> 'monopoly' then raise exception 'This is not a Monopoly room'; end if;
 if exists(select 1 from public.monopoly_match_escrow where room_id=p_room_id and user_id=auth.uid()) then
   return jsonb_build_object('funded',true,'already_funded',true);
 end if;
 select coalesce(entry_fee,0)::bigint into v_fee from public.games where lower(title)='monopoly' limit 1;
 v_fee:=coalesce(v_fee,0);
 select points into v_balance from public.profiles where id=auth.uid() for update;
 if coalesce(v_balance,0)<v_fee then raise exception 'Not enough points for Monopoly entry'; end if;
 update public.profiles set points=points-v_fee where id=auth.uid();
 insert into public.monopoly_match_escrow(room_id,user_id,entry_points,match_currency) values(p_room_id,auth.uid(),v_fee,v_fee*10);
 return jsonb_build_object('funded',true,'entry_points',v_fee,'match_currency',v_fee*10);
end; $function$;

GRANT ALL ON FUNCTION public.fund_monopoly_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.fund_monopoly_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fund_monopoly_room(uuid) TO service_role;

CREATE FUNCTION public.fund_system_four_player_bot_entries (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_game_key text;
  v_entry_fee integer;
  v_seat smallint;
  v_inserted integer := 0;
begin
  select game_key into v_game_key from public.matchmaking_rooms where id = p_room_id;
  if v_game_key not in ('big-two', 'ludo') then
    return jsonb_build_object('funded_bots', 0);
  end if;
  v_entry_fee := public.four_player_entry_fee(v_game_key);
  for v_seat in
    select seat from public.matchmaking_room_players
    where room_id = p_room_id and left_at is null and is_bot
  loop
    insert into public.four_player_bot_escrow(room_id, seat, entry_points)
    values (p_room_id, v_seat, v_entry_fee)
    on conflict (room_id, seat) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return jsonb_build_object('funded_bots', v_inserted, 'entry_points_each', v_entry_fee);
end;
$function$;

GRANT ALL ON FUNCTION public.fund_system_four_player_bot_entries(uuid) TO anon;

GRANT ALL ON FUNCTION public.fund_system_four_player_bot_entries(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fund_system_four_player_bot_entries(uuid) TO service_role;

CREATE FUNCTION public.fund_system_monopoly_bot_entries (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_game_key text;
  v_entry_fee bigint;
  v_seat smallint;
  v_inserted integer := 0;
begin
  select game_key into v_game_key from public.matchmaking_rooms where id = p_room_id;
  if v_game_key <> 'monopoly' then return jsonb_build_object('funded_bots', 0); end if;
  v_entry_fee := public.four_player_entry_fee(v_game_key);
  for v_seat in
    select seat from public.matchmaking_room_players
    where room_id = p_room_id and left_at is null and is_bot
  loop
    insert into public.monopoly_match_bot_escrow(room_id, seat, entry_points, match_currency)
    values (p_room_id, v_seat, v_entry_fee, v_entry_fee * 10)
    on conflict (room_id, seat) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return jsonb_build_object('funded_bots', v_inserted, 'entry_points_each', v_entry_fee);
end;
$function$;

GRANT ALL ON FUNCTION public.fund_system_monopoly_bot_entries(uuid) TO anon;

GRANT ALL ON FUNCTION public.fund_system_monopoly_bot_entries(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.fund_system_monopoly_bot_entries(uuid) TO service_role;

CREATE FUNCTION public.generate_bingo_card()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_card jsonb := '[]'::jsonb;
  v_column integer;
  v_values integer[];
  v_row integer;
begin
  for v_column in 0..4 loop
    select array_agg(number_value)
    into v_values
    from (
      select number_value
      from generate_series(v_column * 15 + 1, v_column * 15 + 15) number_value
      order by random()
      limit 5
    ) selected;

    for v_row in 0..4 loop
      if v_row = 2 and v_column = 2 then
        v_card := v_card || 'null'::jsonb; -- FREE centre square
      else
        v_card := v_card || to_jsonb(v_values[v_row + 1]);
      end if;
    end loop;
  end loop;

  return v_card;
end;
$function$;

GRANT ALL ON FUNCTION public.generate_bingo_card() TO anon;

GRANT ALL ON FUNCTION public.generate_bingo_card() TO authenticated;

GRANT ALL ON FUNCTION public.generate_bingo_card() TO service_role;

CREATE FUNCTION public.get_bingo_opponent_progress (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_seat smallint; v_opponent record;
begin
  select seat into v_seat
  from public.matchmaking_room_players
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  if v_seat is null then
    raise exception 'Not a Bingo player';
  end if;

  select p.display_name, p.is_bot, c.marked into v_opponent
  from public.matchmaking_room_players p
  join public.bingo_match_cards c on c.room_id = p.room_id and c.seat = p.seat
  where p.room_id = p_room_id and p.seat <> v_seat and p.left_at is null
  limit 1;

  if v_opponent.display_name is null then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'name', v_opponent.display_name,
    'is_bot', v_opponent.is_bot,
    'marked', v_opponent.marked
  );
end $function$;

GRANT ALL ON FUNCTION public.get_bingo_opponent_progress(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_bingo_opponent_progress(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_bingo_opponent_progress(uuid) TO service_role;

CREATE FUNCTION public.get_four_in_a_row_match (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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

  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='four-in-a-row';

  -- Bots deliberately wait a moment after a turn changes. This avoids an
  -- instant, mechanical-looking reply while preserving server authority.
  if v_state.status='playing'
     and exists(select 1 from public.matchmaking_room_players p where p.room_id=p_room_id and p.seat=v_state.current_seat and p.is_bot and p.left_at is null)
     and v_state.updated_at <= now()-interval '1800 milliseconds' then
    perform public.resolve_four_in_a_row_bot_turn(p_room_id);
  end if;

  select * into v_state from public.two_player_game_state
  where room_id=p_room_id and game_key='four-in-a-row';
  select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',display_name,'is_bot',is_bot) order by seat),'[]'::jsonb)
  into v_players from public.matchmaking_room_players where room_id=p_room_id and left_at is null;

  return jsonb_build_object('state',v_state.state,'current_seat',v_state.current_seat,
    'version',v_state.version,'status',v_state.status,'turn_deadline',v_state.turn_deadline,
    'my_seat',v_seat,'players',v_players);
end $function$;

GRANT ALL ON FUNCTION public.get_four_in_a_row_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_four_in_a_row_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_four_in_a_row_match(uuid) TO service_role;

CREATE FUNCTION public.get_game_catalog()
  RETURNS TABLE (
    id             uuid,
    title          text,
    description    text,
    category       text,
    entry_fee      numeric,
    image_url      text,
    status         text,
    display_weight integer,
    catalog_label  text,
    average_rating numeric,
    rating_count   bigint,
    my_rating      smallint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select g.id, g.title, g.description, g.category, g.entry_fee, g.image_url,
    g.status, g.display_weight, g.catalog_label,
    coalesce(round(avg(r.rating)::numeric, 1), 0) as average_rating,
    count(r.rating) as rating_count,
    max(r.rating) filter (where r.user_id = auth.uid())::smallint as my_rating
  from public.games g
  left join public.game_ratings r on r.game_id = g.id
  group by g.id
  order by g.display_weight desc, g.created_at desc;
$function$;

GRANT ALL ON FUNCTION public.get_game_catalog() TO anon;

GRANT ALL ON FUNCTION public.get_game_catalog() TO authenticated;

GRANT ALL ON FUNCTION public.get_game_catalog() TO service_role;

CREATE FUNCTION public.get_global_leaderboard_page (
  p_offset integer DEFAULT 0,
  p_limit  integer DEFAULT 10
)
  RETURNS TABLE (
    id         uuid,
    username   text,
    avatar_url text,
    xp         bigint,
    gems       bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select p.id, p.username, p.avatar_url, p.xp, p.gems
  from public.profiles p
  where greatest(coalesce(p_offset, 0), 0) < 50
  order by p.xp desc nulls last, p.created_at asc, p.id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(
    greatest(coalesce(p_limit, 10), 1),
    10,
    greatest(50 - greatest(coalesce(p_offset, 0), 0), 0)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard_page(integer, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_global_leaderboard_page(integer, integer) TO anon;

GRANT ALL ON FUNCTION public.get_global_leaderboard_page(integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.get_global_leaderboard_page(integer, integer) TO service_role;

CREATE FUNCTION public.get_global_leaderboard()
  RETURNS TABLE (
    id         uuid,
    username   text,
    avatar_url text,
    xp         bigint,
    gems       bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select p.id, p.username, p.avatar_url, p.xp, p.gems from public.profiles p order by p.xp desc nulls last, p.created_at asc limit 50;
$function$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard() FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_global_leaderboard() TO anon;

GRANT ALL ON FUNCTION public.get_global_leaderboard() TO authenticated;

GRANT ALL ON FUNCTION public.get_global_leaderboard() TO service_role;

CREATE FUNCTION public.get_matchmaking_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select jsonb_build_object(
    'id', r.id, 'game_key', r.game_key, 'room_code', r.room_code,
    'max_players', r.max_players, 'host_id', r.host_id, 'status', r.status,
    'fill_bots', r.fill_bots, 'expires_at', r.expires_at,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'seat', p.seat, 'user_id', p.user_id, 'name', p.display_name,
      'avatar_url', p.avatar_url, 'is_bot', p.is_bot, 'ready', p.ready
    ) order by p.seat) from public.matchmaking_room_players p where p.room_id = r.id and p.left_at is null), '[]'::jsonb)
  )
  from public.matchmaking_rooms r where r.id = p_room_id;
$function$;

GRANT ALL ON FUNCTION public.get_matchmaking_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_matchmaking_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_matchmaking_room(uuid) TO service_role;

CREATE FUNCTION public.get_my_referral_dashboard()
  RETURNS TABLE (
    invited integer,
    earned  integer
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select count(*)::integer, count(*)::integer * coalesce((select referral_inviter_points from public.platform_config where id = 1), 500)
  from public.profiles where referred_by = auth.uid();
$function$;

GRANT ALL ON FUNCTION public.get_my_referral_dashboard() TO anon;

GRANT ALL ON FUNCTION public.get_my_referral_dashboard() TO authenticated;

GRANT ALL ON FUNCTION public.get_my_referral_dashboard() TO service_role;

CREATE FUNCTION public.get_player_rank_summary()
  RETURNS TABLE (
    tier             text,
    percentile       integer,
    global_rank      integer,
    ranked_players   integer,
    rating           integer,
    matches          integer,
    wins             integer,
    draws            integer,
    win_rate         numeric,
    playtime_seconds bigint,
    badge_icon_url   text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  with completed as (
    select user_id, count(*)::integer matches,
      count(*) filter (where lower(coalesce(result, '')) in ('win', 'victory'))::integer wins,
      count(*) filter (where lower(coalesce(result, '')) = 'draw')::integer draws,
      coalesce(sum(duration_seconds), 0)::bigint playtime_seconds
    from public.match_history
    where lower(coalesce(result, '')) in ('win', 'victory', 'loss', 'defeat', 'draw')
    group by user_id
  ), scored as (
    select user_id, matches, wins, draws, playtime_seconds,
      round(1000 + 500 * (((wins + draws * .5)::numeric / nullif(matches, 0)) - .5) + least(matches, 50) * 4)::integer rating
    from completed
  ), leaderboard as (
    select *, rank() over (order by rating desc, wins desc, matches desc, user_id) global_rank, count(*) over () ranked_players from scored
  ), mine as (
    select coalesce(c.matches, 0) matches, coalesce(c.wins, 0) wins, coalesce(c.draws, 0) draws, coalesce(c.playtime_seconds, 0)::bigint playtime_seconds,
      l.rating, l.global_rank, l.ranked_players
    from (select auth.uid() user_id) me left join completed c on c.user_id = me.user_id left join leaderboard l on l.user_id = me.user_id
  ), presentation as (
    select *, case when global_rank is null then null when ranked_players = 1 then 1 else greatest(1, ceil(global_rank::numeric / ranked_players * 100)::integer) end percentile from mine
  )
  select case when global_rank is null then 'Unranked' when percentile <= 1 then 'Master' when percentile <= 5 then 'Diamond' when percentile <= 20 then 'Platinum' when percentile <= 45 then 'Gold' when percentile <= 75 then 'Silver' else 'Bronze' end,
    percentile, global_rank, ranked_players, coalesce(rating, 1000), matches, wins, draws,
    case when matches = 0 then 0 else round(((wins + draws * .5)::numeric / matches) * 100, 1) end, playtime_seconds,
    (select b.icon_url from public.rank_badges b where b.is_active and b.rank_key = lower(case when global_rank is null then 'Unranked' when percentile <= 1 then 'Master' when percentile <= 5 then 'Diamond' when percentile <= 20 then 'Platinum' when percentile <= 45 then 'Gold' when percentile <= 75 then 'Silver' else 'Bronze' end) limit 1)
  from presentation;
$function$;

REVOKE ALL ON FUNCTION public.get_player_rank_summary() FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_player_rank_summary() TO anon;

GRANT ALL ON FUNCTION public.get_player_rank_summary() TO authenticated;

GRANT ALL ON FUNCTION public.get_player_rank_summary() TO service_role;

CREATE FUNCTION public.get_public_profile_card (
  target_username text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare target public.profiles; result jsonb;
begin
  select * into target from public.profiles where lower(username) = lower(btrim(target_username)) limit 1;
  if not found then return null; end if;
  select jsonb_build_object(
    'id', target.id, 'username', target.username, 'avatar_url', target.avatar_url,
    'points', coalesce(target.points, 0), 'gems', coalesce(target.gems, 0),
    'cosmetics_purchased', (select count(*) from public.user_inventory where user_id = target.id),
    'point_history', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'description', description, 'created_at', created_at) order by created_at desc) from (select amount, description, created_at from public.financial_audit_logs where user_id = target.id order by created_at desc limit 10) ledger), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile_card(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_public_profile_card(text) TO anon;

GRANT ALL ON FUNCTION public.get_public_profile_card(text) TO authenticated;

GRANT ALL ON FUNCTION public.get_public_profile_card(text) TO service_role;

CREATE FUNCTION public.get_public_profile_card (
  target_user_id uuid
)
  RETURNS TABLE (
    user_id             uuid,
    username            text,
    avatar_url          text,
    card_background_url text,
    avatar_frame_url    text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    p.id,
    p.username,
    p.avatar_url,
    (
      select si.image_url from user_inventory ui
      join store_items si on si.id = ui.cosmetic_id
      where ui.user_id = p.id and ui.is_equipped = true and si.cosmetic_type = 'profile_card'
      limit 1
    ),
    (
      select si.image_url from user_inventory ui
      join store_items si on si.id = ui.cosmetic_id
      where ui.user_id = p.id and ui.is_equipped = true and si.cosmetic_type = 'avatar_frame'
      limit 1
    )
  from profiles p where p.id = target_user_id;
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile_card(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.get_public_profile_card(uuid) TO anon;

GRANT ALL ON FUNCTION public.get_public_profile_card(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.get_public_profile_card(uuid) TO service_role;

CREATE FUNCTION public.guard_four_player_paid_start()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_unfunded integer := 0;
  v_total integer;
begin
  if old.status = 'waiting' and new.status = 'starting'
    and new.max_players = 4 and new.game_key in ('monopoly', 'big-two', 'ludo') then
    select count(*) into v_total from public.matchmaking_room_players
    where room_id = new.id and left_at is null;
    if v_total <> 4 then raise exception 'Four players are required before starting'; end if;

    if new.game_key = 'monopoly' then
      select count(*) into v_unfunded
      from public.matchmaking_room_players p
      where p.room_id = new.id and p.left_at is null and not p.is_bot
        and not exists (
          select 1 from public.monopoly_match_escrow e
          where e.room_id = new.id and e.user_id = p.user_id and e.status = 'held'
        );
      if v_unfunded > 0 then raise exception 'Every human player must fund the match before it starts'; end if;
      perform public.fund_system_monopoly_bot_entries(new.id);
    else
      select count(*) into v_unfunded
      from public.matchmaking_room_players p
      where p.room_id = new.id and p.left_at is null and not p.is_bot
        and not exists (
          select 1 from public.four_player_match_escrow e
          where e.room_id = new.id and e.user_id = p.user_id and e.status = 'held'
        );
      if v_unfunded > 0 then raise exception 'Every human player must fund the match before it starts'; end if;
      perform public.fund_system_four_player_bot_entries(new.id);
    end if;
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.guard_four_player_paid_start() TO anon;

GRANT ALL ON FUNCTION public.guard_four_player_paid_start() TO authenticated;

GRANT ALL ON FUNCTION public.guard_four_player_paid_start() TO service_role;

CREATE FUNCTION public.handle_new_auth_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'preferred_username', new.raw_user_meta_data ->> 'user_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'player'), '@', 1), 'player'), '[^a-zA-Z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);
  if char_length(base_username) < 3 then base_username := 'player'; end if;

  insert into public.profiles (id, email, username, avatar_url)
  values (new.id, new.email, left(base_username, 20) || '_' || substr(new.id::text, 1, 6), coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'))
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon;

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;

CREATE FUNCTION public.handle_new_user_registration()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  INSERT INTO public.profiles (id, username, email, points, role, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'guest_' || substr(new.id::text, 1, 6)),
    COALESCE(new.email, ''),
    1000, -- Starting Points Supply Balance
    'player',
    COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://img.icons8.com/illustrations/xlarge/robot.png')
  );
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.handle_new_user_registration() TO anon;

GRANT ALL ON FUNCTION public.handle_new_user_registration() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_user_registration() TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1), -- Automatically grabs the first part of their email as a default username
    'https://api.dicebear.com/7.x/bottts/svg?seed=' || new.id -- Binds their permanent Bottts avatar
  );
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;

GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.heartbeat_matchmaking_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.matchmaking_room_players
  set connected_at=now(), last_seen_at=now(), left_at=null
  where room_id=p_room_id and user_id=auth.uid();
  return jsonb_build_object('ok',found);
end; $function$;

GRANT ALL ON FUNCTION public.heartbeat_matchmaking_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.heartbeat_matchmaking_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.heartbeat_matchmaking_room(uuid) TO service_role;

CREATE FUNCTION public.initialize_bingo_match (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.initialize_bingo_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.initialize_bingo_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.initialize_bingo_match(uuid) TO service_role;

CREATE FUNCTION public.initialize_dominoes_match (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare tiles jsonb; h1 jsonb; h2 jsonb; pile jsonb; opener jsonb; opener_seat smallint;
begin
  if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then raise exception 'Not a room player'; end if;
  if (select count(*) from public.matchmaking_room_players where room_id=p_room_id and left_at is null) <> 2 then raise exception 'Dominoes needs two players'; end if;
  if exists(select 1 from public.dominoes_match_hands where room_id=p_room_id) then return jsonb_build_object('initialized',true); end if;
  select jsonb_agg(tile order by random()) into tiles from (
    select jsonb_build_object('id',a::text||'-'||b::text,'left',a,'right',b) tile
    from generate_series(0,6) a cross join lateral generate_series(a,6) b
  ) x;
  select jsonb_agg(value) into h1 from jsonb_array_elements(tiles) with ordinality x(value,n) where n<=7;
  select jsonb_agg(value) into h2 from jsonb_array_elements(tiles) with ordinality x(value,n) where n between 8 and 14;
  select jsonb_agg(value) into pile from jsonb_array_elements(tiles) with ordinality x(value,n) where n>14;
  select value into opener from jsonb_array_elements(h1) value where (value->>'left')=(value->>'right') order by (value->>'left')::int desc limit 1;
  opener_seat:=1;
  if opener is null or coalesce((opener->>'left')::int,-1) < coalesce((select (value->>'left')::int from jsonb_array_elements(h2) value where value->>'left'=value->>'right' order by (value->>'left')::int desc limit 1),-1) then
    select value into opener from jsonb_array_elements(h2) value where value->>'left'=value->>'right' order by (value->>'left')::int desc limit 1; opener_seat:=2;
  end if;
  -- Place the opening tile automatically. This prevents a client/server turn
  -- race and makes the first playable turn unambiguous for humans and bots.
  if opener is null then
    select value into opener from jsonb_array_elements(h1||h2) value order by ((value->>'left')::int+(value->>'right')::int) desc limit 1;
    opener_seat:=case when exists(select 1 from jsonb_array_elements(h1) value where value->>'id'=opener->>'id') then 1 else 2 end;
  end if;
  if opener_seat=1 then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into h1 from jsonb_array_elements(h1) value where value->>'id'<>opener->>'id';
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into h2 from jsonb_array_elements(h2) value where value->>'id'<>opener->>'id';
  end if;
  insert into public.dominoes_match_hands(room_id,seat,hand) values(p_room_id,1,coalesce(h1,'[]')), (p_room_id,2,coalesce(h2,'[]'));
  update public.two_player_game_state set state=jsonb_build_object('board',jsonb_build_array(opener||jsonb_build_object('reversed',false,'playedSide','start')),'draw_pile',coalesce(pile,'[]'),'opening_tile_id',null,'winner_seat',null,'blocked',false,'passes',0),current_seat=case when opener_seat=1 then 2 else 1 end,status='playing',version=version+1,updated_at=now() where room_id=p_room_id and game_key='dominoes';
  return jsonb_build_object('initialized',true,'opening_seat',opener_seat);
end $function$;

GRANT ALL ON FUNCTION public.initialize_dominoes_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.initialize_dominoes_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.initialize_dominoes_match(uuid) TO service_role;

CREATE FUNCTION public.initialize_monopoly_match (
  p_room_id          uuid,
  p_state            jsonb,
  p_active_player_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_host uuid; v_key text; v_funded integer;
begin
 select host_id,game_key into v_host,v_key from public.matchmaking_rooms where id=p_room_id for update;
 if v_host is distinct from auth.uid() or v_key<>'monopoly' then raise exception 'Only the Monopoly room host may initialize this match'; end if;
 select count(*) into v_funded from public.monopoly_match_escrow where room_id=p_room_id;
 if v_funded < 1 then raise exception 'Monopoly escrow must be funded before play'; end if;
 insert into public.monopoly_match_state(room_id,state,active_player_id)
 values(p_room_id,p_state,p_active_player_id)
 on conflict(room_id) do nothing;
 return jsonb_build_object('initialized',true);
end; $function$;

GRANT ALL ON FUNCTION public.initialize_monopoly_match(uuid, jsonb, uuid) TO anon;

GRANT ALL ON FUNCTION public.initialize_monopoly_match(uuid, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.initialize_monopoly_match(uuid, jsonb, uuid) TO service_role;

CREATE FUNCTION public.join_four_player_host_room_by_code (
  p_room_code  text,
  p_name       text,
  p_avatar_url text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.join_four_player_host_room_by_code(text, text, text) TO anon;

GRANT ALL ON FUNCTION public.join_four_player_host_room_by_code(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_four_player_host_room_by_code(text, text, text) TO service_role;

CREATE FUNCTION public.join_four_player_host_room (
  p_room_id    uuid,
  p_name       text,
  p_avatar_url text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
    insert into public.matchmaking_room_players(room_id, user_id, seat, display_name, avatar_url, ready)
    values (p_room_id, auth.uid(), v_seat, coalesce(nullif(trim(p_name), ''), 'Player'), p_avatar_url, false);
  else
    update public.matchmaking_room_players
    set ready = false, connected_at = now(), last_seen_at = now(),
        display_name = coalesce(nullif(trim(p_name), ''), display_name),
        avatar_url = coalesce(p_avatar_url, avatar_url)
    where room_id = p_room_id and user_id = auth.uid() and left_at is null;
  end if;

  select count(*) into v_count
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;
  return jsonb_build_object('room_id', p_room_id, 'room_code', v_room.room_code,
    'game_key', v_room.game_key, 'seat', v_seat, 'ready_players', v_count);
end;
$function$;

GRANT ALL ON FUNCTION public.join_four_player_host_room(uuid, text, text) TO anon;

GRANT ALL ON FUNCTION public.join_four_player_host_room(uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_four_player_host_room(uuid, text, text) TO service_role;

CREATE FUNCTION public.join_four_player_queue (
  p_game_key   text,
  p_name       text,
  p_avatar_url text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room uuid; v_seat smallint; v_code text;
begin
  -- Serialize joins for each game. Without this lock, four simultaneous first
  -- searches can each observe an empty queue and create separate rooms.
  perform pg_advisory_xact_lock(hashtext(lower(p_game_key)));
  select r.id into v_room from public.matchmaking_rooms r
  where r.game_key = lower(p_game_key) and r.max_players = 4 and r.status = 'waiting' and r.expires_at > now()
    and (select count(*) from public.matchmaking_room_players p where p.room_id = r.id and p.left_at is null) < 4
  order by r.created_at for update skip locked limit 1;
  if v_room is null then
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into public.matchmaking_rooms(game_key, room_code, max_players, host_id) values(lower(p_game_key), v_code, 4, auth.uid()) returning id into v_room;
  end if;
  select coalesce(min(s), 5) into v_seat from generate_series(1,4) s where not exists (select 1 from public.matchmaking_room_players p where p.room_id=v_room and p.seat=s and p.left_at is null);
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,avatar_url) values(v_room,auth.uid(),v_seat,coalesce(nullif(p_name,''),'Player'),p_avatar_url)
  on conflict (room_id,user_id) do update set connected_at=now(),left_at=null;
  return v_room;
end; $function$;

GRANT ALL ON FUNCTION public.join_four_player_queue(text, text, text) TO anon;

GRANT ALL ON FUNCTION public.join_four_player_queue(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_four_player_queue(text, text, text) TO service_role;

CREATE FUNCTION public.join_game_match (
  p_game_title    text,
  p_entry_fee     integer,
  p_opponent_name text    DEFAULT 'Online Opponent'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID;
  v_current_points INT;
  v_updated_points INT;
  v_match_id UUID;
  v_fee INT;
BEGIN
  -- Authenticate user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  v_fee := COALESCE(p_entry_fee, 0);

  -- Get current points
  SELECT points INTO v_current_points
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_current_points IS NULL OR v_current_points < v_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
  END IF;

  -- Deduct fee
  v_updated_points := v_current_points - v_fee;

  UPDATE public.profiles
  SET points = v_updated_points
  WHERE id = v_user_id;

  -- Insert match history record
  INSERT INTO public.match_history (
    user_id,
    game_title,
    opponent_name,
    result,
    points_change
  )
  VALUES (
    v_user_id,
    COALESCE(p_game_title, 'Arcade Game'),
    COALESCE(p_opponent_name, 'Online Opponent'),
    'Played',
    -v_fee
  )
  RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_points', v_updated_points,
    'updatedPoints', v_updated_points,
    'match_id', v_match_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.join_game_match(text, integer, text) TO anon;

GRANT ALL ON FUNCTION public.join_game_match(text, integer, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_game_match(text, integer, text) TO service_role;

CREATE FUNCTION public.join_game_match (
  p_game_title    text,
  p_entry_fee     numeric,
  p_opponent_name text    DEFAULT 'Online Opponent'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_user_id UUID;
  v_current_points NUMERIC;
  v_new_points NUMERIC;
  v_match_id UUID;
BEGIN
  -- Get current authenticated user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Get current point balance
  SELECT points INTO v_current_points
  FROM profiles
  WHERE id = v_user_id;

  IF v_current_points IS NULL OR v_current_points < p_entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS');
  END IF;

  -- Deduct entry fee from profile
  v_new_points := v_current_points - p_entry_fee;
  
  UPDATE profiles
  SET points = v_new_points
  WHERE id = v_user_id;

  -- Record initial match entry in history
  INSERT INTO match_history (user_id, game_title, opponent_name, result, points_change)
  VALUES (v_user_id, p_game_title, COALESCE(p_opponent_name, 'Online Opponent'), 'Played', -p_entry_fee)
  RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'updatedPoints', v_new_points,
    'match_id', v_match_id
  );
END;
$function$;

GRANT ALL ON FUNCTION public.join_game_match(text, numeric, text) TO anon;

GRANT ALL ON FUNCTION public.join_game_match(text, numeric, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_game_match(text, numeric, text) TO service_role;

CREATE FUNCTION public.join_matchmaking (
  p_game_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_opponent record;
  v_match_id uuid;
  v_queue_id uuid;
begin
  -- Clean up any prior waiting entries for this user
  delete from public.matchmaking_queue 
  where user_id = v_user_id and status = 'waiting';

  -- Check if another real player is already waiting for the same game
  select * into v_opponent
  from public.matchmaking_queue
  where game_key = p_game_key
    and status = 'waiting'
    and user_id != v_user_id
  order by created_at asc
  limit 1
  for update skip locked;

  if v_opponent.id is not null then
    -- Real player found! Generate match ID and pair them
    v_match_id := gen_random_uuid();

    update public.matchmaking_queue
    set status = 'matched', match_id = v_match_id, opponent_id = v_user_id
    where id = v_opponent.id;

    return jsonb_build_object(
      'status', 'matched',
      'match_id', v_match_id,
      'opponent_id', v_opponent.user_id,
      'is_bot', false
    );
  else
    -- No waiting player found. Put current player into queue
    insert into public.matchmaking_queue (user_id, game_key, status)
    values (v_user_id, p_game_key, 'waiting')
    returning id into v_queue_id;

    return jsonb_build_object(
      'status', 'waiting',
      'queue_id', v_queue_id
    );
  end if;
end;
$function$;

GRANT ALL ON FUNCTION public.join_matchmaking(text) TO anon;

GRANT ALL ON FUNCTION public.join_matchmaking(text) TO authenticated;

GRANT ALL ON FUNCTION public.join_matchmaking(text) TO service_role;

CREATE FUNCTION public.join_two_player_room (
  p_code text,
  p_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room public.matchmaking_rooms; v_players integer;
begin
  select * into v_room from public.matchmaking_rooms where room_code=upper(trim(p_code)) and max_players=2 and status='waiting' for update;
  if v_room.id is null then raise exception 'Room not found or already started'; end if;
  select count(*) into v_players from public.matchmaking_room_players where room_id=v_room.id and left_at is null;
  if v_players<>1 then raise exception 'Room is full'; end if;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),2,coalesce(nullif(p_name,''),'Player 2'),true);
  update public.matchmaking_rooms set status='playing' where id=v_room.id;
  update public.two_player_game_state set status='playing',updated_at=now() where room_id=v_room.id;
  return jsonb_build_object('room_id',v_room.id,'game_key',v_room.game_key,'seat',2);
end $function$;

GRANT ALL ON FUNCTION public.join_two_player_room(text, text) TO anon;

GRANT ALL ON FUNCTION public.join_two_player_room(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.join_two_player_room(text, text) TO service_role;

CREATE FUNCTION public.leave_bingo_match (
  p_room_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not exists (select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  update public.matchmaking_room_players set left_at=now(), last_seen_at=now()
  where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  update public.matchmaking_rooms set status='cancelled' where id=p_room_id and game_key='bingo' and status in ('waiting','playing');
  update public.two_player_game_state set status='completed',updated_at=now()
  where room_id=p_room_id and game_key='bingo' and status in ('waiting','playing');
end $function$;

GRANT ALL ON FUNCTION public.leave_bingo_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.leave_bingo_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.leave_bingo_match(uuid) TO service_role;

CREATE FUNCTION public.leave_monopoly_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state jsonb; v_active uuid; v_next uuid; v_remaining integer; v_winner uuid;
begin
 update public.matchmaking_room_players set left_at=now() where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 -- Escrow intentionally remains held until settle_monopoly_room; a quitter
 -- cannot withdraw virtual match currency or recover their entry mid-match.
 select state,active_player_id into v_state,v_active from public.monopoly_match_state where room_id=p_room_id and status='playing' for update;
 if v_state is not null then
   v_state:=jsonb_set(v_state,'{players}',(
     select jsonb_agg(case when player->>'id'=auth.uid()::text then jsonb_set(player,'{bankrupt}','true'::jsonb) else player end order by position)
     from jsonb_array_elements(v_state->'players') with ordinality x(player,position)
   ));
   select count(*) into v_remaining from jsonb_array_elements(v_state->'players') p where coalesce((p->>'bankrupt')::boolean,false)=false;
   if v_remaining<=1 then
     select (p->>'id')::uuid into v_winner from jsonb_array_elements(v_state->'players') p where coalesce((p->>'bankrupt')::boolean,false)=false limit 1;
     v_state:=jsonb_set(v_state,'{winnerId}',to_jsonb(v_winner::text));
     update public.monopoly_match_state set state=v_state,status='completed',updated_at=now() where room_id=p_room_id;
   else
     select (player->>'id')::uuid into v_next
     from jsonb_array_elements(v_state->'players') with ordinality x(player,position)
     where coalesce((player->>'bankrupt')::boolean,false)=false and (player->>'id')::uuid<>auth.uid()
     order by case when position>(select position from jsonb_array_elements(v_state->'players') with ordinality y(player,position) where (y.player->>'id')::uuid=v_active limit 1) then 0 else 1 end,position
     limit 1;
     v_state:=jsonb_set(v_state,'{activePlayerId}',to_jsonb(v_next::text));
     update public.monopoly_match_state set state=v_state,active_player_id=v_next,version=version+1,turn_deadline=now()+interval '60 seconds',updated_at=now() where room_id=p_room_id;
   end if;
 end if;
 return jsonb_build_object('left',true,'escrow_held',true,'match_completed',coalesce(v_remaining,2)<=1);
end; $function$;

GRANT ALL ON FUNCTION public.leave_monopoly_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.leave_monopoly_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.leave_monopoly_room(uuid) TO service_role;

CREATE FUNCTION public.log_wallet_balance_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare activity text := coalesce(nullif(current_setting('app.wallet_activity_type', true), ''), 'profile_balance_change'); detail text := coalesce(nullif(current_setting('app.wallet_activity_description', true), ''), 'Wallet balance updated');
begin
  if coalesce(new.points, 0) <> coalesce(old.points, 0) then
    insert into public.wallet_activity_logs (user_id, currency_type, amount, balance_snapshot, activity_type, description)
    values (new.id, 'points', coalesce(new.points, 0) - coalesce(old.points, 0), coalesce(new.points, 0), activity, detail);
  end if;
  if coalesce(new.gems, 0) <> coalesce(old.gems, 0) then
    insert into public.wallet_activity_logs (user_id, currency_type, amount, balance_snapshot, activity_type, description)
    values (new.id, 'gems', coalesce(new.gems, 0) - coalesce(old.gems, 0), coalesce(new.gems, 0), activity, detail);
  end if;
  return new;
end; $function$;

GRANT ALL ON FUNCTION public.log_wallet_balance_change() TO anon;

GRANT ALL ON FUNCTION public.log_wallet_balance_change() TO authenticated;

GRANT ALL ON FUNCTION public.log_wallet_balance_change() TO service_role;

CREATE FUNCTION public.ludo_move (
  p_room_id uuid,
  p_piece   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.ludo_move(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.ludo_move(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.ludo_move(uuid, integer) TO service_role;

CREATE FUNCTION public.ludo_roll (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.ludo_roll(uuid) TO anon;

GRANT ALL ON FUNCTION public.ludo_roll(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.ludo_roll(uuid) TO service_role;

CREATE FUNCTION public.ludo_timeout_turn (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state jsonb; v_current integer; v_deadline timestamptz;
begin
 select state,current_seat,turn_deadline into v_state,v_current,v_deadline from public.ludo_match_state where room_id=p_room_id and status='playing' for update;
 if v_current is null then raise exception 'Match not found'; end if;
 if v_deadline > now() then return jsonb_build_object('advanced',false); end if;
 update public.ludo_match_state set state=jsonb_set(v_state,'{dice}','null'::jsonb),current_seat=(v_current%4)+1,turn_deadline=now()+interval '30 seconds',updated_at=now() where room_id=p_room_id;
 return jsonb_build_object('advanced',true,'current_seat',(v_current%4)+1);
end; $function$;

GRANT ALL ON FUNCTION public.ludo_timeout_turn(uuid) TO anon;

GRANT ALL ON FUNCTION public.ludo_timeout_turn(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.ludo_timeout_turn(uuid) TO service_role;

CREATE FUNCTION public.notify_chat_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if tg_table_name = 'direct_messages' then
    insert into public.user_notifications(user_id,title,message,kind,category)
    values(new.receiver_id, case when new.message_type = 'game_invite' then 'Game challenge received' else 'New message' end, coalesce(new.content, 'You have a new message'), 'chat', 'general');
  elsif tg_table_name = 'friendships' and new.status = 'pending' then
    insert into public.user_notifications(user_id,title,message,kind,category)
    values(new.receiver_id, 'Friend request', 'You have a new connection request.', 'friend_request', 'general');
  end if;
  return new;
end; $function$;

GRANT ALL ON FUNCTION public.notify_chat_activity() TO anon;

GRANT ALL ON FUNCTION public.notify_chat_activity() TO authenticated;

GRANT ALL ON FUNCTION public.notify_chat_activity() TO service_role;

CREATE FUNCTION public.poll_matchmaking (
  p_user_id  uuid,
  p_game_key text,
  p_username text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_match RECORD;
  v_opponent RECORD;
  v_new_match_id UUID;
BEGIN
  -- 1. HOUSEKEEPING (Keep tables clean)
  DELETE FROM public.matchmaking_queue WHERE created_at < now() - interval '2 minutes';
  DELETE FROM public.match_sessions WHERE created_at < now() - interval '10 minutes';

  -- 2. AM I ALREADY MATCHED? (Check the confirmed matches table first)
  SELECT * INTO v_match FROM public.match_sessions 
  WHERE player1_id = p_user_id OR player2_id = p_user_id 
  LIMIT 1;

  IF v_match IS NOT NULL THEN
    -- I am in a match! Return the data so I can enter the game.
    IF v_match.player1_id = p_user_id THEN
      RETURN jsonb_build_object('matched', true, 'match_id', v_match.match_id, 'role', 1, 'opponent_name', v_match.player2_name);
    ELSE
      RETURN jsonb_build_object('matched', true, 'match_id', v_match.match_id, 'role', 2, 'opponent_name', v_match.player1_name);
    END IF;
  END IF;

  -- 3. I AM NOT MATCHED YET. (Add/Update my presence in the waiting queue)
  INSERT INTO public.matchmaking_queue (user_id, game_key, username, created_at)
  VALUES (p_user_id, p_game_key, p_username, now())
  ON CONFLICT (user_id) DO UPDATE SET created_at = now();

  -- 4. ACTIVELY HUNT FOR AN OPPONENT (Look for anyone else in the queue)
  SELECT * INTO v_opponent FROM public.matchmaking_queue 
  WHERE game_key = p_game_key AND user_id != p_user_id
  ORDER BY created_at ASC 
  FOR UPDATE SKIP LOCKED 
  LIMIT 1;

  IF v_opponent IS NOT NULL THEN
    -- 5. OPPONENT FOUND! Lock it in.
    -- A) Create the official match in the Sessions table
    INSERT INTO public.match_sessions (game_key, player1_id, player2_id, player1_name, player2_name)
    VALUES (p_game_key, v_opponent.user_id, p_user_id, v_opponent.username, p_username)
    RETURNING match_id INTO v_new_match_id;

    -- B) Delete BOTH of us from the waiting queue so no one else grabs us
    DELETE FROM public.matchmaking_queue WHERE user_id IN (p_user_id, v_opponent.user_id);

    -- C) Return success to myself immediately
    RETURN jsonb_build_object('matched', true, 'match_id', v_new_match_id, 'role', 2, 'opponent_name', v_opponent.username);
  END IF;

  -- 6. NOBODY FOUND. Keep waiting.
  RETURN jsonb_build_object('matched', false);
END;
$function$;

GRANT ALL ON FUNCTION public.poll_matchmaking(uuid, text, text) TO anon;

GRANT ALL ON FUNCTION public.poll_matchmaking(uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.poll_matchmaking(uuid, text, text) TO service_role;

CREATE FUNCTION public.queue_bingo_match (
  p_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.queue_bingo_match(text) TO anon;

GRANT ALL ON FUNCTION public.queue_bingo_match(text) TO authenticated;

GRANT ALL ON FUNCTION public.queue_bingo_match(text) TO service_role;

CREATE FUNCTION public.queue_dominoes_match (
  p_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare r public.matchmaking_rooms; s smallint; n text; b boolean; code text;
begin
  select mr.* into r from public.matchmaking_rooms mr join public.matchmaking_room_players p on p.room_id=mr.id
  where mr.game_key='dominoes' and mr.status in ('waiting','playing') and p.user_id=auth.uid() and p.left_at is null and mr.created_at>=now()-interval '55 seconds' order by mr.created_at desc limit 1;
  if r.id is not null then
    select seat into s from public.matchmaking_room_players where room_id=r.id and user_id=auth.uid() and left_at is null;
    select display_name,is_bot into n,b from public.matchmaking_room_players where room_id=r.id and seat<>s and left_at is null limit 1;
    return jsonb_build_object('room_id',r.id,'seat',s,'matched',r.status='playing','opponent_name',n,'is_bot',coalesce(b,false));
  end if;
  select * into r from public.matchmaking_rooms mr where mr.game_key='dominoes' and mr.status='waiting' and mr.max_players=2 and mr.created_at>=now()-interval '45 seconds' and exists(select 1 from public.matchmaking_room_players p where p.room_id=mr.id and p.user_id is distinct from auth.uid() and not p.is_bot and p.left_at is null) order by mr.created_at limit 1 for update skip locked;
  if r.id is not null then
    insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(r.id,auth.uid(),2,coalesce(nullif(p_name,''),'Online Player'),true);
    update public.matchmaking_rooms set status='playing' where id=r.id;
    update public.two_player_game_state set status='playing',current_seat=1,updated_at=now() where room_id=r.id and game_key='dominoes';
    select display_name into n from public.matchmaking_room_players where room_id=r.id and seat=1;
    return jsonb_build_object('room_id',r.id,'seat',2,'matched',true,'opponent_name',n,'is_bot',false);
  end if;
  code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at) values('dominoes',code,2,auth.uid(),true,now()+interval '24 hours') returning * into r;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(r.id,auth.uid(),1,coalesce(nullif(p_name,''),'Online Player'),true);
  insert into public.two_player_game_state(room_id,game_key,state,status) values(r.id,'dominoes','{}'::jsonb,'waiting');
  return jsonb_build_object('room_id',r.id,'seat',1,'matched',false);
end $function$;

GRANT ALL ON FUNCTION public.queue_dominoes_match(text) TO anon;

GRANT ALL ON FUNCTION public.queue_dominoes_match(text) TO authenticated;

GRANT ALL ON FUNCTION public.queue_dominoes_match(text) TO service_role;

CREATE FUNCTION public.queue_four_in_a_row_match (
  p_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.queue_four_in_a_row_match(text) TO anon;

GRANT ALL ON FUNCTION public.queue_four_in_a_row_match(text) TO authenticated;

GRANT ALL ON FUNCTION public.queue_four_in_a_row_match(text) TO service_role;

CREATE FUNCTION public.reconcile_bingo_winners()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room record; v_winner smallint; v_count integer := 0;
begin
  for v_room in
    select s.room_id
    from public.two_player_game_state s
    where s.game_key='bingo' and s.status='playing'
  loop
    select c.seat into v_winner
    from public.bingo_match_cards c
    where c.room_id=v_room.room_id and public.bingo_line_count(c.marked) >= 1
    order by c.updated_at desc, c.seat
    limit 1;
    if v_winner is not null then
      update public.two_player_game_state
      set state=jsonb_set(state,'{winner_seat}',to_jsonb(v_winner),true), status='completed', version=version+1, updated_at=now()
      where room_id=v_room.room_id and status='playing';
      update public.matchmaking_rooms set status='completed' where id=v_room.room_id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $function$;

GRANT ALL ON FUNCTION public.reconcile_bingo_winners() TO anon;

GRANT ALL ON FUNCTION public.reconcile_bingo_winners() TO authenticated;

GRANT ALL ON FUNCTION public.reconcile_bingo_winners() TO service_role;

CREATE FUNCTION public.record_match_result (
  p_user_id        uuid,
  p_game_id        text,
  p_result         text,
  p_match_duration integer,
  p_kills          integer,
  p_deaths         integer,
  p_assists        integer,
  p_mmr_change     integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
    v_win_increment INTEGER;
BEGIN
    -- 1. Insert the match record into the history table
    INSERT INTO match_history (
        user_id, game_id, result, match_duration, kills, deaths, assists, mmr_change
    ) VALUES (
        p_user_id, p_game_id, p_result, p_match_duration, p_kills, p_deaths, p_assists, p_mmr_change
    );

    -- 2. Check if the match was a win
    IF p_result = 'win' THEN
        v_win_increment := 1;
    ELSE
        v_win_increment := 0;
    END IF;

    -- 3. Atomically update the user's profile stats
    UPDATE profiles
    SET 
        total_matches = total_matches + 1,
        total_wins = total_wins + v_win_increment,
        total_kills = total_kills + p_kills,
        total_deaths = total_deaths + p_deaths,
        total_assists = total_assists + p_assists,
        total_playtime_seconds = total_playtime_seconds + p_match_duration,
        -- GREATEST(0, ...) ensures MMR never drops into negative numbers
        mmr = GREATEST(0, mmr + p_mmr_change)
    WHERE id = p_user_id;

END;
$function$;

GRANT ALL ON FUNCTION public.record_match_result(uuid, text, text, integer, integer, integer, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.record_match_result(uuid, text, text, integer, integer, integer, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.record_match_result(uuid, text, text, integer, integer, integer, integer, integer) TO service_role;

CREATE FUNCTION public.replace_expired_four_player_seats (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_room public.matchmaking_rooms; v_replaced integer := 0; v_name text;
begin
  select * into v_room from public.matchmaking_rooms where id=p_room_id for update;
  if v_room.id is null or v_room.max_players<>4 or v_room.status<>'playing' then
    return jsonb_build_object('replaced',0);
  end if;
  for v_name in
    select seat::text from public.matchmaking_room_players
    where room_id=p_room_id and not is_bot
      and last_seen_at < now() - case when v_room.game_key='monopoly' then interval '60 seconds' else interval '30 seconds' end
    for update
  loop
    update public.matchmaking_room_players
    set user_id=null, display_name='ReconnectBot_' || v_name, avatar_url=null,
        is_bot=true, ready=true, connected_at=now(), last_seen_at=now(), left_at=null
    where room_id=p_room_id and seat=v_name::smallint;
    v_replaced:=v_replaced+1;
  end loop;
  return jsonb_build_object('replaced',v_replaced);
end; $function$;

GRANT ALL ON FUNCTION public.replace_expired_four_player_seats(uuid) TO anon;

GRANT ALL ON FUNCTION public.replace_expired_four_player_seats(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.replace_expired_four_player_seats(uuid) TO service_role;

CREATE FUNCTION public.request_friend (
  target_user_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is null or target_user_id = auth.uid() then raise exception 'Invalid friend request'; end if;
  insert into public.friendships(requester_id, receiver_id, status)
  values(auth.uid(), target_user_id, 'pending')
  on conflict (requester_id, receiver_id) do update set status = case when public.friendships.status = 'declined' then 'pending' else public.friendships.status end;
end; $function$;

GRANT ALL ON FUNCTION public.request_friend(uuid) TO anon;

GRANT ALL ON FUNCTION public.request_friend(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.request_friend(uuid) TO service_role;

CREATE FUNCTION public.reset_all_user_points()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  affected_users INT;
BEGIN
  -- Reset user points in profiles table
  UPDATE public.profiles
  SET points = 0;

  GET DIAGNOSTICS affected_users = ROW_COUNT;

  -- Record timestamp of this reset execution
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES ('last_points_reset_at', to_jsonb(NOW()), NOW())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'affected_users', affected_users,
    'reset_at', NOW()
  );
END;
$function$;

GRANT ALL ON FUNCTION public.reset_all_user_points() TO anon;

GRANT ALL ON FUNCTION public.reset_all_user_points() TO authenticated;

GRANT ALL ON FUNCTION public.reset_all_user_points() TO service_role;

CREATE FUNCTION public.reset_matchmaking (
  p_user_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  -- 1. Wipe any ghost waiting tickets
  DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;
  
  -- 2. Wipe any old, finished match sessions from previous games
  DELETE FROM public.match_sessions WHERE player1_id = p_user_id OR player2_id = p_user_id;
END;
$function$;

GRANT ALL ON FUNCTION public.reset_matchmaking(uuid) TO anon;

GRANT ALL ON FUNCTION public.reset_matchmaking(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reset_matchmaking(uuid) TO service_role;

CREATE FUNCTION public.resolve_big_two_bot_turns (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_current integer;
  v_status text;
  v_deadline timestamptz;
  v_is_bot boolean;
begin
  select current_seat, status, turn_deadline
  into v_current, v_status, v_deadline
  from public.big_two_match_state
  where room_id = p_room_id
  for update;

  if v_status is distinct from 'playing' or v_current is null then
    return jsonb_build_object('resolved_steps', 0);
  end if;

  select is_bot
  into v_is_bot
  from public.matchmaking_room_players
  where room_id = p_room_id
    and seat = v_current
    and left_at is null;

  -- Human players own the whole 30-second turn unless it expires.
  if not coalesce(v_is_bot, false) then
    if v_deadline > now() then
      return jsonb_build_object('resolved_steps', 0);
    end if;

    perform public.big_two_timeout_turn(p_room_id);
    return jsonb_build_object('resolved_steps', 1, 'timed_out_human', true);
  end if;

  -- Keep the normal 30-second countdown. A bot thinks for about two seconds,
  -- then plays or passes without rewriting the turn deadline.
  if v_deadline is null or v_deadline > now() + interval '28 seconds' then
    return jsonb_build_object('resolved_steps', 0, 'bot_thinking', true);
  end if;

  perform public.big_two_timeout_turn(p_room_id);
  return jsonb_build_object('resolved_steps', 1);
end;
$function$;

GRANT ALL ON FUNCTION public.resolve_big_two_bot_turns(uuid) TO anon;

GRANT ALL ON FUNCTION public.resolve_big_two_bot_turns(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.resolve_big_two_bot_turns(uuid) TO service_role;

CREATE FUNCTION public.resolve_dominoes_bot_turn (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_state public.two_player_game_state;
  v_bot_seat smallint;
  v_hand jsonb;
  v_board jsonb;
  v_pile jsonb;
  v_tile jsonb;
  v_next_hand jsonb;
  v_right_end integer;
  v_reversed boolean := false;
  v_played jsonb;
  v_won boolean;
begin
  select * into v_state
  from public.two_player_game_state
  where room_id = p_room_id and game_key = 'dominoes'
  for update;

  if v_state.room_id is null or v_state.status <> 'playing' then
    return jsonb_build_object('acted', false);
  end if;

  select seat into v_bot_seat
  from public.matchmaking_room_players
  where room_id = p_room_id
    and seat = v_state.current_seat
    and is_bot
    and left_at is null;

  if v_bot_seat is null then
    return jsonb_build_object('acted', false);
  end if;

  select hand into v_hand
  from public.dominoes_match_hands
  where room_id = p_room_id and seat = v_bot_seat;

  v_hand := coalesce(v_hand, '[]'::jsonb);
  v_board := coalesce(v_state.state -> 'board', '[]'::jsonb);
  v_pile := coalesce(v_state.state -> 'draw_pile', '[]'::jsonb);

  select value into v_tile
  from jsonb_array_elements(v_hand) as x(value)
  where public.dominoes_tile_playable(value, v_board)
  order by ((value ->> 'left')::integer + (value ->> 'right')::integer) desc,
           value ->> 'id'
  limit 1;

  -- Draw one tile only when no current tile can be played.  The new tile is
  -- considered immediately, which prevents a bot turn from getting stranded.
  if v_tile is null and jsonb_array_length(v_pile) > 0 then
    v_hand := v_hand || jsonb_build_array(v_pile -> 0);
    v_pile := v_pile - 0;
    select value into v_tile
    from jsonb_array_elements(v_hand) as x(value)
    where public.dominoes_tile_playable(value, v_board)
    order by ((value ->> 'left')::integer + (value ->> 'right')::integer) desc,
             value ->> 'id'
    limit 1;
  end if;

  if v_tile is null then
    update public.dominoes_match_hands
    set hand = v_hand
    where room_id = p_room_id and seat = v_bot_seat;

    update public.two_player_game_state
    set state = jsonb_set(v_state.state, '{draw_pile}', v_pile, true),
        current_seat = case when v_bot_seat = 1 then 2 else 1 end,
        version = version + 1,
        updated_at = now()
    where room_id = p_room_id and game_key = 'dominoes';

    return jsonb_build_object('passed', true);
  end if;

  if jsonb_array_length(v_board) = 0 then
    v_played := v_tile || jsonb_build_object('reversed', false, 'playedSide', 'start');
    v_board := jsonb_build_array(v_played);
  else
    v_right_end := case
      when coalesce((v_board -> -1 ->> 'reversed')::boolean, false)
        then (v_board -> -1 ->> 'left')::integer
      else (v_board -> -1 ->> 'right')::integer
    end;
    v_reversed := (v_tile ->> 'right')::integer = v_right_end
      and (v_tile ->> 'left')::integer <> v_right_end;
    v_played := v_tile || jsonb_build_object('reversed', v_reversed, 'playedSide', 'right');
    v_board := v_board || jsonb_build_array(v_played);
  end if;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_next_hand
  from jsonb_array_elements(v_hand) as x(value)
  where value ->> 'id' <> v_tile ->> 'id';

  v_won := jsonb_array_length(v_next_hand) = 0;

  update public.dominoes_match_hands
  set hand = v_next_hand
  where room_id = p_room_id and seat = v_bot_seat;

  update public.two_player_game_state
  set state = jsonb_set(
        jsonb_set(
          jsonb_set(v_state.state, '{board}', v_board, true),
          '{draw_pile}', v_pile, true
        ),
        '{passes}', '0'::jsonb, true
      ) || jsonb_build_object('winner_seat', case when v_won then v_bot_seat else null end),
      current_seat = case
        when v_won then v_bot_seat
        when v_bot_seat = 1 then 2 else 1
      end,
      status = case when v_won then 'completed' else 'playing' end,
      version = version + 1,
      updated_at = now()
  where room_id = p_room_id and game_key = 'dominoes';

  if v_won then
    update public.matchmaking_rooms set status = 'completed' where id = p_room_id;
  end if;

  return jsonb_build_object('acted', true, 'played', true);
end;
$function$;

GRANT ALL ON FUNCTION public.resolve_dominoes_bot_turn(uuid) TO anon;

GRANT ALL ON FUNCTION public.resolve_dominoes_bot_turn(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.resolve_dominoes_bot_turn(uuid) TO service_role;

CREATE FUNCTION public.resolve_four_in_a_row_bot_turn (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.resolve_four_in_a_row_bot_turn(uuid) TO anon;

GRANT ALL ON FUNCTION public.resolve_four_in_a_row_bot_turn(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.resolve_four_in_a_row_bot_turn(uuid) TO service_role;

CREATE FUNCTION public.resolve_ludo_bot_turns (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_current_seat integer;
  v_status text;
  v_state jsonb;
  v_is_bot boolean;
  v_dice integer;
  v_piece integer;
  v_steps integer := 0;
begin
  loop
    -- Important: only resolve ONE action per call.
    exit when v_steps >= 1;

    select state, current_seat, status
    into v_state, v_current_seat, v_status
    from public.ludo_match_state
    where room_id = p_room_id
    for update;

    exit when v_status is distinct from 'playing'
      or v_current_seat is null;

    select is_bot
    into v_is_bot
    from public.matchmaking_room_players
    where room_id = p_room_id
      and seat = v_current_seat
      and left_at is null;

    -- Stop immediately when it is a real player's turn.
    exit when not coalesce(v_is_bot, false);

    v_dice := nullif(v_state->>'dice', '')::integer;

    -- Bot rolls first.
    if v_dice is null then
      perform public.ludo_roll(p_room_id);
      v_steps := v_steps + 1;
      continue;
    end if;

    -- Then bot selects a legal token to move.
    select token_index
    into v_piece
    from (
      select
        ordinal - 1 as token_index,
        value::integer as progress,
        case
          when value::integer >= 0 and value::integer + v_dice = 58 then 3
          when value::integer >= 0 then 2
          when value::integer = -1 and v_dice = 6 then 1
          else 0
        end as priority
      from jsonb_array_elements_text(
        v_state->'tokens'->(v_current_seat - 1)
      ) with ordinality x(value, ordinal)
      where
        (value::integer = -1 and v_dice = 6)
        or
        (value::integer >= 0 and value::integer + v_dice <= 58)
    ) legal_moves
    order by priority desc, progress desc, token_index asc
    limit 1;

    -- Fallback when no move is legal.
    if v_piece is null then
      update public.ludo_match_state
      set state = jsonb_set(state, '{dice}', 'null'::jsonb, true),
          current_seat = (current_seat % 4) + 1,
          turn_deadline = now() + interval '30 seconds',
          updated_at = now()
      where room_id = p_room_id
        and status = 'playing';

      v_steps := v_steps + 1;
      continue;
    end if;

    perform public.ludo_move(p_room_id, v_piece);
    v_steps := v_steps + 1;
  end loop;

  return jsonb_build_object('resolved_steps', v_steps);
end;
$function$;

GRANT ALL ON FUNCTION public.resolve_ludo_bot_turns(uuid) TO anon;

GRANT ALL ON FUNCTION public.resolve_ludo_bot_turns(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.resolve_ludo_bot_turns(uuid) TO service_role;

CREATE FUNCTION public.resolve_monopoly_jail_turn (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_state jsonb;
  v_active uuid;
  v_version integer;
  v_active_position integer;
  v_next uuid;
  v_cards integer;
  v_used_pass boolean := false;
  v_deadline timestamptz;
begin
  if not exists (
    select 1 from public.matchmaking_room_players
    where room_id=p_room_id and user_id=auth.uid() and left_at is null
  ) then
    raise exception 'Not a Monopoly room member';
  end if;

  select state, active_player_id, version
    into v_state, v_active, v_version
  from public.monopoly_match_state
  where room_id=p_room_id and status='playing'
  for update;
  if not found then return jsonb_build_object('resolved', false); end if;

  -- A player who has just landed in Jail finishes the landing turn normally.
  -- The forced resolution occurs only when their next playable turn begins.
  if coalesce((v_state->>'hasRolled')::boolean, false) then
    return jsonb_build_object('resolved', false);
  end if;

  select roster.position, coalesce((roster.player->>'jailFreeCards')::integer, 0)
    into v_active_position, v_cards
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where roster.player->>'id'=v_active::text
    and coalesce((roster.player->>'inJail')::boolean, false)
  limit 1;
  if v_active_position is null then return jsonb_build_object('resolved', false); end if;

  if v_cards > 0 then
    v_used_pass := true;
    v_next := v_active;
    v_state := jsonb_set(
      v_state,
      array['players', (v_active_position - 1)::text],
      jsonb_set(
        jsonb_set(v_state->'players'->(v_active_position - 1), '{inJail}', 'false'::jsonb),
        '{jailFreeCards}', to_jsonb(v_cards - 1)
      )
    );
  else
    select (roster.player->>'id')::uuid into v_next
    from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
    where not coalesce((roster.player->>'bankrupt')::boolean, false)
      and roster.player->>'id'<>v_active::text
    order by case when roster.position > v_active_position then 0 else 1 end,
             roster.position
    limit 1;
    if v_next is null then return jsonb_build_object('resolved', false); end if;
    v_state := jsonb_set(
      v_state,
      array['players', (v_active_position - 1)::text],
      jsonb_set(
        jsonb_set(v_state->'players'->(v_active_position - 1), '{inJail}', 'false'::jsonb),
        '{jailAttempts}', '0'::jsonb
      )
    );
  end if;

  v_state := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)),
        '{hasRolled}', 'false'::jsonb),
      '{autoPassPlayerId}', 'null'::jsonb),
    '{turnWarning}', 'false'::jsonb);
  v_state := jsonb_set(v_state, '{actionLog}', jsonb_build_object(
    'title', case when v_used_pass then 'JAIL PASS USED' else 'JAIL TURN SKIPPED' end,
    'highlight', case when v_used_pass then 'ESCAPED JAIL · CAN ROLL' else 'NEXT PLAYER READY' end
  ));

  update public.monopoly_match_state
  set state=v_state,
      active_player_id=v_next,
      version=v_version+1,
      turn_deadline=now()+interval '60 seconds',
      updated_at=now()
  where room_id=p_room_id
  returning turn_deadline into v_deadline;

  return jsonb_build_object(
    'resolved', true,
    'used_jail_pass', v_used_pass,
    'state', v_state,
    'active_player_id', v_next,
    'version', v_version+1,
    'turn_deadline', v_deadline
  );
end;
$function$;

GRANT ALL ON FUNCTION public.resolve_monopoly_jail_turn(uuid) TO anon;

GRANT ALL ON FUNCTION public.resolve_monopoly_jail_turn(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.resolve_monopoly_jail_turn(uuid) TO service_role;

CREATE FUNCTION public.respond_to_friend_request (
  request_id uuid,
  accepted   boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.friendships set status = case when accepted then 'accepted' else 'declined' end
  where id = request_id and receiver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Friend request not found'; end if;
end; $function$;

GRANT ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO anon;

GRANT ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE FUNCTION public.roll_monopoly_dice (
  p_room_id          uuid,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.roll_monopoly_dice(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.roll_monopoly_dice(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.roll_monopoly_dice(uuid, integer) TO service_role;

CREATE FUNCTION public.run_big_two_bot_turns (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_result jsonb;
begin
  select public.resolve_big_two_bot_turns(p_room_id)
  into v_result;

  return coalesce(v_result, jsonb_build_object('resolved_steps', 0));
end;
$function$;

GRANT ALL ON FUNCTION public.run_big_two_bot_turns(uuid) TO anon;

GRANT ALL ON FUNCTION public.run_big_two_bot_turns(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.run_big_two_bot_turns(uuid) TO service_role;

CREATE FUNCTION public.set_matchmaking_seat_ready (
  p_room_id uuid,
  p_ready   boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_game_key text;
  v_humans integer;
  v_unready integer;
  v_total integer;
  v_unfunded integer;
begin
  update public.matchmaking_room_players
  set ready = p_ready, connected_at = now(), last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid() and left_at is null;

  select game_key into v_game_key
  from public.matchmaking_rooms
  where id = p_room_id
  for update;
  if v_game_key is null then raise exception 'Matchmaking room not found'; end if;

  select count(*) filter (where not is_bot),
         count(*) filter (where not ready),
         count(*)
  into v_humans, v_unready, v_total
  from public.matchmaking_room_players
  where room_id = p_room_id and left_at is null;

  if v_game_key = 'monopoly' then
    select count(*) into v_unfunded
    from public.matchmaking_room_players p
    where p.room_id = p_room_id and p.left_at is null and not p.is_bot
      and not exists (
        select 1 from public.monopoly_match_escrow e
        where e.room_id = p_room_id and e.user_id = p.user_id and e.status = 'held'
      );
  elsif v_game_key in ('big-two', 'ludo') then
    select count(*) into v_unfunded
    from public.matchmaking_room_players p
    where p.room_id = p_room_id and p.left_at is null and not p.is_bot
      and not exists (
        select 1 from public.four_player_match_escrow e
        where e.room_id = p_room_id and e.user_id = p.user_id and e.status = 'held'
      );
  else
    v_unfunded := 0;
  end if;

  if v_total = 4 and v_unready = 0 and v_unfunded = 0 then
    update public.matchmaking_rooms
    set status = 'starting'
    where id = p_room_id and status = 'waiting';
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'human_players', v_humans,
    'all_ready', v_unready = 0,
    'all_funded', v_unfunded = 0
  );
end;
$function$;

GRANT ALL ON FUNCTION public.set_matchmaking_seat_ready(uuid, boolean) TO anon;

GRANT ALL ON FUNCTION public.set_matchmaking_seat_ready(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_matchmaking_seat_ready(uuid, boolean) TO service_role;

CREATE FUNCTION public.settle_competitive_match (
  p_stake_id         uuid,
  p_result           text,
  p_game_id          text    DEFAULT NULL::text,
  p_duration_seconds integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_stake public.competitive_match_stakes;
  v_result text := lower(trim(coalesce(p_result, 'loss')));
  v_payout integer;
  v_points integer;
begin
  select * into v_stake
  from public.competitive_match_stakes
  where id = p_stake_id
    and user_id = auth.uid()
  for update;

  if v_stake.id is null then
    raise exception 'Competitive stake not found';
  end if;

  if v_stake.status = 'settled' then
    select coalesce(points, 0) into v_points from public.profiles where id = auth.uid();
    return jsonb_build_object('success', true, 'payout', v_stake.payout, 'new_points', v_points, 'already_settled', true);
  end if;

  if v_result not in ('win', 'loss', 'draw') then
    raise exception 'Unsupported match result';
  end if;

  -- Both human players have put in an entry fee, so the winner takes two
  -- entries. A bot has no wallet: losing to it sends the collected entry back
  -- to the system, while beating it receives the advertised two-entry prize.
  v_payout := case
    when v_result = 'win' then v_stake.entry_fee * 2
    when v_result = 'draw' then v_stake.entry_fee
    else 0
  end;

  update public.profiles
  set points = coalesce(points, 0) + v_payout
  where id = auth.uid()
  returning points into v_points;

  update public.competitive_match_stakes
  set status = 'settled',
      result = initcap(v_result),
      payout = v_payout,
      settled_at = now()
  where id = v_stake.id;

  insert into public.match_history(
    user_id, game_id, game_title, opponent_name, result, points_change, duration_seconds
  )
  values (
    auth.uid(), p_game_id, v_stake.game_title, v_stake.opponent_name,
    initcap(v_result), v_payout, greatest(coalesce(p_duration_seconds, 0), 0)
  );

  return jsonb_build_object('success', true, 'payout', v_payout, 'new_points', v_points);
end;
$function$;

GRANT ALL ON FUNCTION public.settle_competitive_match(uuid, text, text, integer) TO anon;

GRANT ALL ON FUNCTION public.settle_competitive_match(uuid, text, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.settle_competitive_match(uuid, text, text, integer) TO service_role;

CREATE FUNCTION public.settle_completed_monopoly_match (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state jsonb; v_winner uuid; v_circulation bigint; v_reward bigint; v_winner_is_bot boolean;
begin
  select state into v_state from public.monopoly_match_state where room_id = p_room_id and status = 'completed' for update;
  if v_state is null or not exists (select 1 from public.matchmaking_room_players where room_id = p_room_id and user_id = auth.uid() and left_at is null) then
    raise exception 'Only an active Monopoly player can settle this match';
  end if;
  v_winner := (v_state->>'winnerId')::uuid;
  if v_winner is null then raise exception 'No Monopoly winner was recorded'; end if;
  -- Require a complete end-state: one non-bankrupt player with no opponent
  -- cash or properties. This prevents paying a partial checkpoint snapshot.
  if (select count(*) from jsonb_array_elements(v_state->'players') p where not coalesce((p->>'bankrupt')::boolean, false)) <> 1 then
    raise exception 'Monopoly match is not in a valid end state';
  end if;
  v_circulation := greatest(0, coalesce((v_state->>'circulationBalance')::bigint, 0));
  if v_circulation = 0 then raise exception 'Invalid Monopoly circulation balance'; end if;
  v_reward := floor(v_circulation * .10);
  select is_bot into v_winner_is_bot from public.matchmaking_room_players where room_id = p_room_id and user_id = v_winner and left_at is null;
  if not found then v_winner_is_bot := true; end if;
  if not coalesce(v_winner_is_bot, false) then update public.profiles set points = points + v_reward where id = v_winner; end if;
  update public.monopoly_match_escrow set status = 'settled' where room_id = p_room_id and status = 'held';
  update public.monopoly_match_bot_escrow set status = 'settled', settled_at = now() where room_id = p_room_id and status = 'held';
  update public.matchmaking_rooms set status = 'completed' where id = p_room_id;
  insert into public.match_history(user_id, game_title, opponent_name, result, points_change, duration_seconds)
  select e.user_id, 'Monopoly', 'Monopoly multiplayer', case when e.user_id = v_winner and not coalesce(v_winner_is_bot, false) then 'win' else 'loss' end,
    case when e.user_id = v_winner and not coalesce(v_winner_is_bot, false) then v_reward else 0 end,
    greatest(0, extract(epoch from now() - r.created_at)::integer)
  from public.monopoly_match_escrow e join public.matchmaking_rooms r on r.id = e.room_id where e.room_id = p_room_id;
  return jsonb_build_object('winner_id', v_winner, 'total_match_currency', v_circulation, 'winner_points', case when coalesce(v_winner_is_bot, false) then 0 else v_reward end);
end;
$function$;

GRANT ALL ON FUNCTION public.settle_completed_monopoly_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.settle_completed_monopoly_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.settle_completed_monopoly_match(uuid) TO service_role;

CREATE FUNCTION public.settle_four_player_result_trigger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_winner_seat smallint;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_winner_seat := nullif(new.state ->> 'winner_seat', '')::smallint;
    if v_winner_seat is not null then
      perform public.settle_four_player_room(new.room_id, v_winner_seat);
    end if;
  end if;
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.settle_four_player_result_trigger() TO anon;

GRANT ALL ON FUNCTION public.settle_four_player_result_trigger() TO authenticated;

GRANT ALL ON FUNCTION public.settle_four_player_result_trigger() TO service_role;

CREATE FUNCTION public.settle_four_player_room (
  p_room_id     uuid,
  p_winner_seat smallint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_game_key text;
  v_winner_id uuid;
  v_winner_is_bot boolean;
  v_total integer;
  v_duration integer;
begin
  select game_key, greatest(0, extract(epoch from now() - created_at)::integer)
  into v_game_key, v_duration
  from public.matchmaking_rooms where id = p_room_id for update;
  if v_game_key not in ('big-two', 'ludo') then raise exception 'This is not a supported four-player room'; end if;

  select user_id, is_bot into v_winner_id, v_winner_is_bot
  from public.matchmaking_room_players
  where room_id = p_room_id and seat = p_winner_seat and left_at is null;
  if not found then raise exception 'Winning seat is not in this room'; end if;

  select coalesce((select sum(entry_points) from public.four_player_match_escrow where room_id = p_room_id and status = 'held'), 0)
       + coalesce((select sum(entry_points) from public.four_player_bot_escrow where room_id = p_room_id and status = 'held'), 0)
  into v_total;

  if not coalesce(v_winner_is_bot, false) and v_winner_id is not null then
    update public.profiles set points = coalesce(points, 0) + v_total where id = v_winner_id;
  end if;
  update public.four_player_match_escrow set status = 'settled', settled_at = now()
  where room_id = p_room_id and status = 'held';
  update public.four_player_bot_escrow set status = 'settled', settled_at = now()
  where room_id = p_room_id and status = 'held';

  insert into public.match_history(user_id, game_title, opponent_name, result, points_change, duration_seconds)
  select e.user_id,
         case v_game_key when 'big-two' then 'Big Two' else 'Ludo' end,
         'Four-player arena',
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then 'win' else 'loss' end,
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then v_total else 0 end,
         v_duration
  from public.four_player_match_escrow e where e.room_id = p_room_id;

  update public.matchmaking_rooms set status = 'completed' where id = p_room_id;
  return jsonb_build_object('settled', true, 'winner_seat', p_winner_seat,
    'payout', case when coalesce(v_winner_is_bot, false) then 0 else v_total end,
    'bot_won', coalesce(v_winner_is_bot, false));
end;
$function$;

GRANT ALL ON FUNCTION public.settle_four_player_room(uuid, smallint) TO anon;

GRANT ALL ON FUNCTION public.settle_four_player_room(uuid, smallint) TO authenticated;

GRANT ALL ON FUNCTION public.settle_four_player_room(uuid, smallint) TO service_role;

CREATE FUNCTION public.settle_monopoly_room (
  p_room_id   uuid,
  p_winner_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_total bigint; v_reward bigint; v_host uuid; v_winner_is_bot boolean;
begin
  select host_id into v_host from public.matchmaking_rooms where id = p_room_id for update;
  if v_host is distinct from auth.uid() then raise exception 'Only the room host can settle Monopoly'; end if;
  select is_bot into v_winner_is_bot from public.matchmaking_room_players where room_id = p_room_id and user_id = p_winner_id and left_at is null;
  if not found then raise exception 'Winner is not in this room'; end if;
  select coalesce((select sum(match_currency) from public.monopoly_match_escrow where room_id=p_room_id and status='held'),0)
       + coalesce((select sum(match_currency) from public.monopoly_match_bot_escrow where room_id=p_room_id and status='held'),0)
  into v_total;
  v_reward := floor(v_total * 0.10);
  if not coalesce(v_winner_is_bot, false) then update public.profiles set points=points+v_reward where id=p_winner_id; end if;
  update public.monopoly_match_escrow set status='settled' where room_id=p_room_id and status='held';
  update public.monopoly_match_bot_escrow set status='settled', settled_at=now() where room_id=p_room_id and status='held';
  update public.matchmaking_rooms set status='completed' where id=p_room_id;
  return jsonb_build_object('total_match_currency',v_total,'winner_points',case when coalesce(v_winner_is_bot,false) then 0 else v_reward end);
end; $function$;

GRANT ALL ON FUNCTION public.settle_monopoly_room(uuid, uuid) TO anon;

GRANT ALL ON FUNCTION public.settle_monopoly_room(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.settle_monopoly_room(uuid, uuid) TO service_role;

CREATE FUNCTION public.skip_monopoly_jail_turn (
  p_room_id          uuid,
  p_expected_version integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state jsonb; v_version integer; v_active uuid; v_next uuid; v_is_member boolean;
begin
  select state, version, active_player_id into v_state, v_version, v_active
  from public.monopoly_match_state where room_id = p_room_id and status = 'playing' for update;
  select exists(select 1 from public.matchmaking_room_players where room_id = p_room_id and user_id = auth.uid() and left_at is null) into v_is_member;
  if v_version is null or not v_is_member then raise exception 'Monopoly room is unavailable'; end if;
  if v_version <> p_expected_version then raise exception 'The board changed; please wait for sync'; end if;
  if v_active is distinct from auth.uid() and v_active::text not like '00000000-0000-4000-8000-%' then raise exception 'It is not the jailed player''s turn'; end if;
  if not exists(select 1 from jsonb_array_elements(v_state->'players') p where p->>'id' = v_active::text and coalesce((p->>'inJail')::boolean, false)) then
    raise exception 'The active Monopoly player is not in Jail';
  end if;
  select (p.player->>'id')::uuid into v_next
  from jsonb_array_elements(v_state->'players') with ordinality p(player, seat)
  where not coalesce((p.player->>'bankrupt')::boolean, false) and (p.player->>'id') <> v_active::text
  order by case when p.seat > (select q.seat from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text) then 0 else 1 end, p.seat
  limit 1;
  if v_next is null then raise exception 'No eligible Monopoly player remains'; end if;
  v_state := jsonb_set(v_state, array['players', (select (q.seat - 1)::text from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text)], jsonb_set(jsonb_set((select q.player from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text), '{inJail}', 'false'::jsonb), '{jailAttempts}', '0'::jsonb));
  v_state := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)), '{hasRolled}', 'false'::jsonb), '{autoPassPlayerId}', 'null'::jsonb), '{turnWarning}', 'false'::jsonb), '{actionLog}', jsonb_build_object('title', 'JAIL TURN SKIPPED', 'highlight', 'NEXT PLAYER READY'));
  update public.monopoly_match_state set state = v_state, active_player_id = v_next, version = version + 1, turn_deadline = now() + interval '60 seconds', updated_at = now() where room_id = p_room_id;
  insert into public.monopoly_match_events(room_id, state_version, actor_id, action, summary) values (p_room_id, v_version + 1, auth.uid(), 'jail_skip', 'Jail turn skipped');
  return jsonb_build_object('version', v_version + 1, 'next_player_id', v_next);
end;
$function$;

GRANT ALL ON FUNCTION public.skip_monopoly_jail_turn(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.skip_monopoly_jail_turn(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.skip_monopoly_jail_turn(uuid, integer) TO service_role;

CREATE FUNCTION public.spin_daily_wheel()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  chosen public.wheel_rewards;
  player public.profiles;
  settings public.platform_config;
  roll numeric;
  total numeric;
  charge integer;
  charge_currency text;
  new_balance integer;
begin
  select * into player from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if player.last_spin is not null and player.last_spin > now() - interval '24 hours' then
    raise exception 'Daily spin is still on cooldown';
  end if;

  select * into settings from public.platform_config where id = 1;
  charge := greatest(coalesce(settings.wheel_spin_cost, 20), 0);
  charge_currency := coalesce(settings.wheel_spin_currency, 'points');
  if charge_currency = 'gems' and coalesce(player.gems, 0) < charge then
    raise exception 'Insufficient gems for this spin';
  elsif charge_currency = 'points' and coalesce(player.points, 0) < charge then
    raise exception 'Insufficient points for this spin';
  end if;

  select coalesce(sum(probability), 0) into total from public.wheel_rewards where is_active;
  if total <= 0 then raise exception 'No wheel rewards are configured'; end if;
  roll := random() * total;
  select r.* into chosen from (
    select r.*, sum(probability) over (order by display_order, id) as threshold
    from public.wheel_rewards r where is_active
  ) r where r.threshold >= roll order by r.threshold limit 1;
  if not found then raise exception 'Could not select a wheel reward'; end if;

  if charge > 0 then
    perform set_config('app.wallet_activity_type', 'wheel_spin_cost', true);
    perform set_config('app.wallet_activity_description', 'Wheel spin entry cost', true);
    if charge_currency = 'gems' then
      update public.profiles set gems = coalesce(gems, 0) - charge where id = auth.uid();
    else
      update public.profiles set points = coalesce(points, 0) - charge where id = auth.uid();
    end if;
  end if;

  perform set_config('app.wallet_activity_type', 'daily_wheel', true);
  perform set_config('app.wallet_activity_description', 'Daily wheel reward: ' || chosen.label, true);
  if chosen.reward_type = 'points' then
    update public.profiles
    set points = coalesce(points, 0) + chosen.reward_value, last_spin = now()
    where id = auth.uid() returning points into new_balance;
  else
    update public.profiles
    set gems = coalesce(gems, 0) + chosen.reward_value, last_spin = now()
    where id = auth.uid() returning gems into new_balance;
  end if;

  return jsonb_build_object(
    'id', chosen.id, 'label', chosen.label, 'type', chosen.reward_type,
    'value', chosen.reward_value, 'balance', new_balance, 'spun_at', now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.spin_daily_wheel() FROM PUBLIC;

GRANT ALL ON FUNCTION public.spin_daily_wheel() TO anon;

GRANT ALL ON FUNCTION public.spin_daily_wheel() TO authenticated;

GRANT ALL ON FUNCTION public.spin_daily_wheel() TO service_role;

CREATE FUNCTION public.start_four_in_a_row_match (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.start_four_in_a_row_match(uuid) TO anon;

GRANT ALL ON FUNCTION public.start_four_in_a_row_match(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.start_four_in_a_row_match(uuid) TO service_role;

CREATE FUNCTION public.start_four_player_room (
  p_room_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_host uuid; v_count integer; v_status text;
begin
  select host_id, status into v_host, v_status from public.matchmaking_rooms where id=p_room_id for update;
  select count(*) into v_count from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
  if v_host is distinct from auth.uid() or v_count <> 4 or v_status <> 'starting' then raise exception 'Only the host may start a ready four-player room'; end if;
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  if (select game_key from public.matchmaking_rooms where id=p_room_id) = 'ludo' then
    insert into public.ludo_match_state(room_id,state,current_seat,turn_deadline,status)
    values (p_room_id, jsonb_build_object('tokens', jsonb_build_array(jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1),jsonb_build_array(-1,-1,-1,-1)), 'dice', null, 'winner_seat', null), 1, now()+interval '30 seconds', 'playing')
    on conflict(room_id) do update set state=excluded.state,current_seat=1,turn_deadline=excluded.turn_deadline,status='playing',updated_at=now();
  end if;
  return jsonb_build_object('room_id',p_room_id,'started',true);
end; $function$;

GRANT ALL ON FUNCTION public.start_four_player_room(uuid) TO anon;

GRANT ALL ON FUNCTION public.start_four_player_room(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.start_four_player_room(uuid) TO service_role;

CREATE FUNCTION public.touch_chat_presence()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$function$;

GRANT ALL ON FUNCTION public.touch_chat_presence() TO anon;

GRANT ALL ON FUNCTION public.touch_chat_presence() TO authenticated;

GRANT ALL ON FUNCTION public.touch_chat_presence() TO service_role;

CREATE FUNCTION public.update_monopoly_match_state (
  p_room_id               uuid,
  p_state                 jsonb,
  p_expected_version      integer,
  p_next_active_player_id uuid,
  p_completed             boolean DEFAULT false,
  p_action                text    DEFAULT 'state_sync'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end; $function$;

GRANT ALL ON FUNCTION public.update_monopoly_match_state(uuid, jsonb, integer, uuid, boolean, text) TO anon;

GRANT ALL ON FUNCTION public.update_monopoly_match_state(uuid, jsonb, integer, uuid, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.update_monopoly_match_state(uuid, jsonb, integer, uuid, boolean, text) TO service_role;

CREATE FUNCTION public.update_profile_language (
  new_language text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ begin if new_language not in ('en','my','th','zh','km','lo','fr','de','es') then raise exception 'Unsupported language'; end if; update public.profiles set language = new_language where id = auth.uid(); end; $function$;

GRANT ALL ON FUNCTION public.update_profile_language(text) TO anon;

GRANT ALL ON FUNCTION public.update_profile_language(text) TO authenticated;

GRANT ALL ON FUNCTION public.update_profile_language(text) TO service_role;

CREATE FUNCTION public.update_two_player_game_state (
  p_room_id          uuid,
  p_state            jsonb,
  p_current_seat     smallint,
  p_expected_version integer,
  p_completed        boolean  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_state public.two_player_game_state; v_seat smallint;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id for update;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.id is null or v_seat is null then raise exception 'Not a room player'; end if;
  if v_state.status<>'playing' then raise exception 'Game is not active'; end if;
  if v_state.current_seat<>v_seat then raise exception 'Not your turn'; end if;
  if v_state.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
  update public.two_player_game_state set state=p_state,current_seat=p_current_seat,version=version+1,status=case when p_completed then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('version',v_state.version+1);
end $function$;

GRANT ALL ON FUNCTION public.update_two_player_game_state(uuid, jsonb, smallint, integer, boolean) TO anon;

GRANT ALL ON FUNCTION public.update_two_player_game_state(uuid, jsonb, smallint, integer, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.update_two_player_game_state(uuid, jsonb, smallint, integer, boolean) TO service_role;

CREATE FUNCTION public.validate_monopoly_state_economy (
  p_state jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select coalesce((p_state->>'roundLimit')::integer, 100) in (30, 50, 100)
    and coalesce((p_state->>'roundsLeft')::integer, -1) between 0 and coalesce((p_state->>'roundLimit')::integer, 100)
    and coalesce((p_state->>'circulationBalance')::bigint, 0) >= 0;
$function$;

GRANT ALL ON FUNCTION public.validate_monopoly_state_economy(jsonb) TO anon;

GRANT ALL ON FUNCTION public.validate_monopoly_state_economy(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.validate_monopoly_state_economy(jsonb) TO service_role;

CREATE TABLE public.account_requests (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id       uuid                     NOT NULL,
  request_type  text                     NOT NULL,
  details       text                     DEFAULT ''::text NOT NULL,
  status        text                     DEFAULT 'pending'::text NOT NULL,
  reviewed_by   uuid,
  reviewer_note text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at   timestamp with time zone
);

ALTER TABLE public.account_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_request_type_check CHECK (request_type = ANY (ARRAY['email_change'::text, 'account_deletion'::text, 'other'::text]));

ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));

GRANT ALL ON public.account_requests TO anon;

GRANT ALL ON public.account_requests TO authenticated;

GRANT ALL ON public.account_requests TO service_role;

CREATE INDEX account_requests_status_created_idx ON public.account_requests (status, created_at DESC);

CREATE POLICY "users create their account requests" ON public.account_requests
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "users read their account requests" ON public.account_requests
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.achievements_catalog (
  id            uuid    DEFAULT gen_random_uuid() NOT NULL,
  title         text    NOT NULL,
  badge_icon    text    NOT NULL,
  credit_reward integer DEFAULT 0,
  conditions    jsonb   DEFAULT '{}'::jsonb
);

ALTER TABLE public.achievements_catalog
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.achievements_catalog
  ADD CONSTRAINT achievements_catalog_pkey PRIMARY KEY (id);

ALTER TABLE public.achievements_catalog
  ADD CONSTRAINT achievements_catalog_title_key UNIQUE (title);

GRANT ALL ON public.achievements_catalog TO anon;

GRANT ALL ON public.achievements_catalog TO authenticated;

GRANT ALL ON public.achievements_catalog TO service_role;

CREATE TABLE public.ad_banners (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title       text                     NOT NULL,
  placement   text                     NOT NULL,
  image_url   text                     NOT NULL,
  target_url  text,
  impressions integer                  DEFAULT 0,
  clicks      integer                  DEFAULT 0,
  is_active   boolean                  DEFAULT true,
  created_at  timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ad_banners
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_banners
  ADD CONSTRAINT ad_banners_pkey PRIMARY KEY (id);

ALTER TABLE public.ad_banners
  ADD CONSTRAINT ad_banners_placement_check CHECK (placement = ANY (ARRAY['homepage_hero'::text, 'arcade_sidebar'::text, 'game_over_interstitial'::text, 'footer_banner'::text]));

GRANT ALL ON public.ad_banners TO anon;

GRANT ALL ON public.ad_banners TO authenticated;

GRANT ALL ON public.ad_banners TO service_role;

CREATE TABLE public.big_two_match_state (
  room_id       uuid                     NOT NULL,
  state         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  current_seat  smallint                 DEFAULT 1 NOT NULL,
  turn_deadline timestamp with time zone,
  status        text                     DEFAULT 'waiting'::text NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.big_two_match_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.big_two_match_state
  ADD CONSTRAINT big_two_match_state_pkey PRIMARY KEY (room_id);

ALTER TABLE public.big_two_match_state
  ADD CONSTRAINT big_two_match_state_status_check CHECK (status = ANY (ARRAY['waiting'::text, 'playing'::text, 'completed'::text, 'abandoned'::text]));

GRANT ALL ON public.big_two_match_state TO anon;

GRANT ALL ON public.big_two_match_state TO authenticated;

GRANT ALL ON public.big_two_match_state TO service_role;

CREATE TRIGGER big_two_authoritative_winner
  BEFORE UPDATE OF state, status ON public.big_two_match_state
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_big_two_winner();

CREATE TRIGGER settle_big_two_four_player_result
  AFTER UPDATE OF status ON public.big_two_match_state
  FOR EACH ROW
  EXECUTE FUNCTION public.settle_four_player_result_trigger();

CREATE TABLE public.big_two_player_hands (
  room_id    uuid                     NOT NULL,
  seat       smallint                 NOT NULL,
  cards      jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.big_two_player_hands
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.big_two_player_hands
  ADD CONSTRAINT big_two_player_hands_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.big_two_player_hands
  ADD CONSTRAINT big_two_player_hands_seat_check CHECK (seat >= 1 AND seat <= 4);

GRANT ALL ON public.big_two_player_hands TO anon;

GRANT ALL ON public.big_two_player_hands TO authenticated;

GRANT ALL ON public.big_two_player_hands TO service_role;

CREATE TABLE public.bingo_match_cards (
  room_id    uuid                     NOT NULL,
  seat       smallint                 NOT NULL,
  card       jsonb                    NOT NULL,
  marked     jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.bingo_match_cards
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bingo_match_cards
  ADD CONSTRAINT bingo_match_cards_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.bingo_match_cards
  ADD CONSTRAINT bingo_match_cards_seat_check CHECK (seat = ANY (ARRAY[1, 2]));

GRANT ALL ON public.bingo_match_cards TO anon;

GRANT ALL ON public.bingo_match_cards TO authenticated;

GRANT ALL ON public.bingo_match_cards TO service_role;

CREATE TABLE public.chat_group_members (
  group_id  uuid                     NOT NULL,
  user_id   uuid                     NOT NULL,
  role      text                     DEFAULT 'member'::text NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_group_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_pkey PRIMARY KEY (group_id, user_id);

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

GRANT ALL ON public.chat_group_members TO anon;

GRANT ALL ON public.chat_group_members TO authenticated;

GRANT ALL ON public.chat_group_members TO service_role;

CREATE POLICY "members visible" ON public.chat_group_members
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.chat_group_messages (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  group_id   uuid                     NOT NULL,
  sender_id  uuid                     NOT NULL,
  content    text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_group_messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_group_messages
  ADD CONSTRAINT chat_group_messages_content_check CHECK (char_length(TRIM(BOTH FROM content)) >= 1 AND char_length(TRIM(BOTH FROM content)) <= 2000);

ALTER TABLE public.chat_group_messages
  ADD CONSTRAINT chat_group_messages_pkey PRIMARY KEY (id);

GRANT ALL ON public.chat_group_messages TO anon;

GRANT ALL ON public.chat_group_messages TO authenticated;

GRANT ALL ON public.chat_group_messages TO service_role;

CREATE INDEX chat_group_messages_group_created_idx ON public.chat_group_messages (group_id, created_at);

CREATE POLICY "members read group messages" ON public.chat_group_messages
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.chat_group_members m
  WHERE ((m.group_id = chat_group_messages.group_id) AND (m.user_id = auth.uid())))));

CREATE POLICY "members send group messages" ON public.chat_group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.chat_group_members m
  WHERE ((m.group_id = chat_group_messages.group_id) AND (m.user_id = auth.uid()))))));

CREATE TABLE public.chat_groups (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name        text                     NOT NULL,
  description text                     DEFAULT ''::text NOT NULL,
  created_by  uuid                     NOT NULL,
  is_public   boolean                  DEFAULT true NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "users join public groups" ON public.chat_group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (((role = 'member'::text) AND (EXISTS ( SELECT 1
   FROM public.chat_groups g
  WHERE ((g.id = chat_group_members.group_id) AND g.is_public)))) OR ((role = 'owner'::text) AND (EXISTS ( SELECT 1
   FROM public.chat_groups g
  WHERE ((g.id = chat_group_members.group_id) AND (g.created_by = auth.uid()))))))));

ALTER TABLE public.chat_groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_groups
  ADD CONSTRAINT chat_groups_name_check CHECK (char_length(name) >= 3 AND char_length(name) <= 60);

ALTER TABLE public.chat_groups
  ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;

ALTER TABLE public.chat_group_messages
  ADD CONSTRAINT chat_group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;

GRANT ALL ON public.chat_groups TO anon;

GRANT ALL ON public.chat_groups TO authenticated;

GRANT ALL ON public.chat_groups TO service_role;

CREATE POLICY "public groups visible" ON public.chat_groups
  FOR SELECT
  TO authenticated
  USING ((is_public OR (created_by = auth.uid())));

CREATE POLICY "users create groups" ON public.chat_groups
  FOR INSERT
  TO authenticated
  WITH CHECK ((created_by = auth.uid()));

CREATE TABLE public.checkers_matches (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  p1_id       uuid                     NOT NULL,
  p2_id       uuid,
  board       jsonb                    NOT NULL,
  turn        integer                  DEFAULT 1 NOT NULL,
  p1_captures integer                  DEFAULT 0 NOT NULL,
  p2_captures integer                  DEFAULT 0 NOT NULL,
  status      text                     DEFAULT 'waiting'::text NOT NULL,
  winner      integer,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  room_code   text,
  p1_score    integer                  DEFAULT 0 NOT NULL,
  p2_score    integer                  DEFAULT 0 NOT NULL
);

ALTER TABLE public.checkers_matches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.checkers_matches
  ADD CONSTRAINT checkers_matches_p1_id_fkey FOREIGN KEY (p1_id) REFERENCES auth.users(id);

ALTER TABLE public.checkers_matches
  ADD CONSTRAINT checkers_matches_p2_id_fkey FOREIGN KEY (p2_id) REFERENCES auth.users(id);

ALTER TABLE public.checkers_matches
  ADD CONSTRAINT checkers_matches_pkey PRIMARY KEY (id);

GRANT ALL ON public.checkers_matches TO anon;

GRANT ALL ON public.checkers_matches TO authenticated;

GRANT ALL ON public.checkers_matches TO service_role;

CREATE POLICY "Anyone can view live matches" ON public.checkers_matches
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create matches" ON public.checkers_matches
  FOR INSERT
  WITH CHECK ((auth.uid() = p1_id));

CREATE POLICY "Players can update matches or claim open slots" ON public.checkers_matches
  FOR UPDATE
  USING (((auth.uid() = p1_id) OR (auth.uid() = p2_id) OR (p2_id IS NULL)));

CREATE TABLE public.community_reports (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  reporter_id         uuid,
  reported_user_id    uuid,
  reported_user_email text,
  reason              text                     NOT NULL,
  details             text,
  status              text                     DEFAULT 'pending'::text,
  created_at          timestamp with time zone DEFAULT now()
);

ALTER TABLE public.community_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_pkey PRIMARY KEY (id);

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text]));

GRANT ALL ON public.community_reports TO anon;

GRANT ALL ON public.community_reports TO authenticated;

GRANT ALL ON public.community_reports TO service_role;

CREATE TABLE public.competitive_match_stakes (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id       uuid                     NOT NULL,
  game_title    text                     NOT NULL,
  opponent_name text                     DEFAULT 'Online Opponent'::text NOT NULL,
  entry_fee     integer                  NOT NULL,
  status        text                     DEFAULT 'active'::text NOT NULL,
  result        text,
  payout        integer                  DEFAULT 0 NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  settled_at    timestamp with time zone
);

ALTER TABLE public.competitive_match_stakes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.competitive_match_stakes
  ADD CONSTRAINT competitive_match_stakes_entry_fee_check CHECK (entry_fee >= 0);

ALTER TABLE public.competitive_match_stakes
  ADD CONSTRAINT competitive_match_stakes_payout_check CHECK (payout >= 0);

ALTER TABLE public.competitive_match_stakes
  ADD CONSTRAINT competitive_match_stakes_pkey PRIMARY KEY (id);

ALTER TABLE public.competitive_match_stakes
  ADD CONSTRAINT competitive_match_stakes_status_check CHECK (status = ANY (ARRAY['active'::text, 'settled'::text, 'cancelled'::text]));

GRANT ALL ON public.competitive_match_stakes TO anon;

GRANT ALL ON public.competitive_match_stakes TO authenticated;

GRANT ALL ON public.competitive_match_stakes TO service_role;

CREATE INDEX competitive_match_stakes_active_idx ON public.competitive_match_stakes (user_id, game_title, created_at DESC)
  WHERE status = 'active'::text;

CREATE POLICY "players read own competitive stakes" ON public.competitive_match_stakes
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.cosmetics (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name          text                     NOT NULL,
  game_category text                     NOT NULL,
  item_type     text                     NOT NULL,
  price_gems    integer                  DEFAULT 0 NOT NULL,
  modifiers     jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  image_url     text,
  created_at    timestamp with time zone DEFAULT now(),
  cosmetic_type text                     DEFAULT 'game_cosmetic'::text NOT NULL,
  game_target   text
);

COMMENT ON COLUMN public.cosmetics.game_target IS 'Exact native game key; unscoped legacy game cosmetics are ignored until an admin assigns a target.';

ALTER TABLE public.cosmetics
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cosmetics
  ADD CONSTRAINT cosmetics_cosmetic_type_check CHECK (cosmetic_type = ANY (ARRAY['game_cosmetic'::text, 'profile_card'::text, 'avatar_frame'::text]));

ALTER TABLE public.cosmetics
  ADD CONSTRAINT cosmetics_pkey PRIMARY KEY (id);

GRANT ALL ON public.cosmetics TO anon;

GRANT ALL ON public.cosmetics TO authenticated;

GRANT ALL ON public.cosmetics TO service_role;

CREATE POLICY "Allow public read access to cosmetics" ON public.cosmetics
  FOR SELECT
  USING (true);

CREATE TABLE public.daily_claims (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid,
  points_awarded integer                  NOT NULL,
  claimed_at     timestamp with time zone DEFAULT now()
);

ALTER TABLE public.daily_claims
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_claims
  ADD CONSTRAINT daily_claims_pkey PRIMARY KEY (id);

GRANT ALL ON public.daily_claims TO anon;

GRANT ALL ON public.daily_claims TO authenticated;

GRANT ALL ON public.daily_claims TO service_role;

CREATE TABLE public.direct_messages (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  sender_id     uuid                     NOT NULL,
  receiver_id   uuid                     NOT NULL,
  content       text,
  message_type  text                     DEFAULT 'text'::text NOT NULL,
  match_id      uuid,
  game_name     text,
  invite_status text                     DEFAULT 'pending'::text,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  read_at       timestamp with time zone
);

ALTER TABLE public.direct_messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.direct_messages
  REPLICA IDENTITY FULL;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);

GRANT ALL ON public.direct_messages TO anon;

GRANT ALL ON public.direct_messages TO authenticated;

GRANT ALL ON public.direct_messages TO service_role;

CREATE INDEX direct_messages_receiver_unread_idx ON public.direct_messages (receiver_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TRIGGER direct_message_notification
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_activity();

CREATE POLICY "Receivers can update message statuses (like accepting an invite" ON public.direct_messages
  FOR UPDATE
  USING ((auth.uid() = receiver_id));

CREATE POLICY "Users can send messages" ON public.direct_messages
  FOR INSERT
  WITH CHECK ((auth.uid() = sender_id));

CREATE POLICY "Users can view their own conversations" ON public.direct_messages
  FOR SELECT
  USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));

CREATE TABLE public.dominoes_match_hands (
  room_id uuid     NOT NULL,
  seat    smallint NOT NULL,
  hand    jsonb    DEFAULT '[]'::jsonb NOT NULL
);

ALTER TABLE public.dominoes_match_hands
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dominoes_match_hands
  ADD CONSTRAINT dominoes_match_hands_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.dominoes_match_hands
  ADD CONSTRAINT dominoes_match_hands_seat_check CHECK (seat = ANY (ARRAY[1, 2]));

GRANT ALL ON public.dominoes_match_hands TO anon;

GRANT ALL ON public.dominoes_match_hands TO authenticated;

GRANT ALL ON public.dominoes_match_hands TO service_role;

CREATE TABLE public.financial_audit_logs (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid,
  amount           integer                  NOT NULL,
  balance_snapshot integer                  NOT NULL,
  mutation_type    text                     NOT NULL,
  description      text,
  created_at       timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  currency_type    text                     DEFAULT 'points'::text NOT NULL
);

ALTER TABLE public.financial_audit_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT financial_audit_logs_currency_type_check CHECK (currency_type = ANY (ARRAY['points'::text, 'gems'::text]));

ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT financial_audit_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.financial_audit_logs TO anon;

GRANT ALL ON public.financial_audit_logs TO authenticated;

GRANT ALL ON public.financial_audit_logs TO service_role;

CREATE TABLE public.four_player_bot_escrow (
  room_id      uuid                     NOT NULL,
  seat         smallint                 NOT NULL,
  entry_points integer                  NOT NULL,
  status       text                     DEFAULT 'held'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  settled_at   timestamp with time zone
);

ALTER TABLE public.four_player_bot_escrow
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.four_player_bot_escrow
  ADD CONSTRAINT four_player_bot_escrow_entry_points_check CHECK (entry_points >= 0);

ALTER TABLE public.four_player_bot_escrow
  ADD CONSTRAINT four_player_bot_escrow_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.four_player_bot_escrow
  ADD CONSTRAINT four_player_bot_escrow_seat_check CHECK (seat >= 1 AND seat <= 4);

ALTER TABLE public.four_player_bot_escrow
  ADD CONSTRAINT four_player_bot_escrow_status_check CHECK (status = ANY (ARRAY['held'::text, 'settled'::text]));

GRANT ALL ON public.four_player_bot_escrow TO anon;

GRANT ALL ON public.four_player_bot_escrow TO authenticated;

GRANT ALL ON public.four_player_bot_escrow TO service_role;

CREATE TABLE public.four_player_match_escrow (
  room_id      uuid                     NOT NULL,
  user_id      uuid                     NOT NULL,
  entry_points integer                  NOT NULL,
  status       text                     DEFAULT 'held'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  settled_at   timestamp with time zone
);

ALTER TABLE public.four_player_match_escrow
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.four_player_match_escrow
  ADD CONSTRAINT four_player_match_escrow_entry_points_check CHECK (entry_points >= 0);

ALTER TABLE public.four_player_match_escrow
  ADD CONSTRAINT four_player_match_escrow_pkey PRIMARY KEY (room_id, user_id);

ALTER TABLE public.four_player_match_escrow
  ADD CONSTRAINT four_player_match_escrow_status_check CHECK (status = ANY (ARRAY['held'::text, 'settled'::text, 'refunded'::text]));

GRANT ALL ON public.four_player_match_escrow TO anon;

GRANT ALL ON public.four_player_match_escrow TO authenticated;

GRANT ALL ON public.four_player_match_escrow TO service_role;

CREATE INDEX four_player_match_escrow_held_idx ON public.four_player_match_escrow (room_id)
  WHERE status = 'held'::text;

CREATE POLICY "four player members read own escrow" ON public.four_player_match_escrow
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.friendships (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  requester_id uuid                     NOT NULL,
  receiver_id  uuid                     NOT NULL,
  status       text                     DEFAULT 'pending'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.friendships
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);

ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id);

ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_requester_id_receiver_id_key UNIQUE (requester_id, receiver_id);

GRANT ALL ON public.friendships TO anon;

GRANT ALL ON public.friendships TO authenticated;

GRANT ALL ON public.friendships TO service_role;

CREATE TRIGGER friendship_notification
  AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_activity();

CREATE POLICY "Users can accept requests sent to them" ON public.friendships
  FOR UPDATE
  USING ((auth.uid() = receiver_id));

CREATE POLICY "Users can insert friend requests" ON public.friendships
  FOR INSERT
  WITH CHECK ((auth.uid() = requester_id));

CREATE POLICY "Users can see their own friendships" ON public.friendships
  FOR SELECT
  USING (((auth.uid() = requester_id) OR (auth.uid() = receiver_id)));

CREATE TABLE public.game_catalog (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title         text                     NOT NULL,
  url_slug      text                     NOT NULL,
  category      text                     NOT NULL,
  tags          text[],
  config_matrix jsonb                    DEFAULT '{}'::jsonb,
  is_featured   boolean                  DEFAULT false,
  is_available  boolean                  DEFAULT true,
  age_rating    text                     DEFAULT 'E'::text,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_catalog
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_catalog
  ADD CONSTRAINT game_catalog_pkey PRIMARY KEY (id);

ALTER TABLE public.game_catalog
  ADD CONSTRAINT game_catalog_title_key UNIQUE (title);

ALTER TABLE public.game_catalog
  ADD CONSTRAINT game_catalog_url_slug_key UNIQUE (url_slug);

GRANT ALL ON public.game_catalog TO anon;

GRANT ALL ON public.game_catalog TO authenticated;

GRANT ALL ON public.game_catalog TO service_role;

CREATE TABLE public.game_categories (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  icon_url   text                     NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_categories
  ADD CONSTRAINT game_categories_name_key UNIQUE (name);

ALTER TABLE public.game_categories
  ADD CONSTRAINT game_categories_pkey PRIMARY KEY (id);

GRANT ALL ON public.game_categories TO anon;

GRANT ALL ON public.game_categories TO authenticated;

GRANT ALL ON public.game_categories TO service_role;

CREATE TABLE public.game_favorites (
  user_id    uuid                     NOT NULL,
  game_id    text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.game_favorites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_favorites
  ADD CONSTRAINT game_favorites_pkey PRIMARY KEY (user_id, game_id);

GRANT ALL ON public.game_favorites TO anon;

GRANT ALL ON public.game_favorites TO authenticated;

GRANT ALL ON public.game_favorites TO service_role;

CREATE POLICY "users manage their game favorites" ON public.game_favorites
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.game_invites (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  sender_id   uuid                     NOT NULL,
  receiver_id uuid                     NOT NULL,
  match_id    uuid                     NOT NULL,
  game_name   text                     NOT NULL,
  status      text                     DEFAULT 'pending'::text NOT NULL,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_invites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_invites
  ADD CONSTRAINT game_invites_pkey PRIMARY KEY (id);

ALTER TABLE public.game_invites
  ADD CONSTRAINT game_invites_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

GRANT ALL ON public.game_invites TO anon;

GRANT ALL ON public.game_invites TO authenticated;

GRANT ALL ON public.game_invites TO service_role;

CREATE POLICY "Receivers can update invite status" ON public.game_invites
  FOR UPDATE
  USING ((auth.uid() = receiver_id));

CREATE POLICY "Users can see their own invites" ON public.game_invites
  FOR SELECT
  USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));

CREATE POLICY "Users can send invites" ON public.game_invites
  FOR INSERT
  WITH CHECK ((auth.uid() = sender_id));

CREATE TABLE public.game_ratings (
  game_id    uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  rating     smallint                 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.game_ratings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_ratings
  ADD CONSTRAINT game_ratings_pkey PRIMARY KEY (game_id, user_id);

ALTER TABLE public.game_ratings
  ADD CONSTRAINT game_ratings_rating_check CHECK (rating >= 1 AND rating <= 5);

GRANT ALL ON public.game_ratings TO anon;

GRANT ALL ON public.game_ratings TO authenticated;

GRANT ALL ON public.game_ratings TO service_role;

CREATE INDEX game_ratings_game_idx ON public.game_ratings (game_id);

CREATE POLICY "game ratings are readable" ON public.game_ratings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users create their game ratings" ON public.game_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "users update their game ratings" ON public.game_ratings
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.game_sessions (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  game_id    uuid,
  mode       public.match_type        DEFAULT 'casual'::public.match_type,
  state      public.session_state     DEFAULT 'lobby'::public.session_state,
  entry_cost integer                  DEFAULT 0,
  prize_pool integer                  DEFAULT 0,
  metadata   jsonb                    DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.game_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_sessions
  REPLICA IDENTITY FULL;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.game_catalog(id) ON DELETE CASCADE;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);

GRANT ALL ON public.game_sessions TO anon;

GRANT ALL ON public.game_sessions TO authenticated;

GRANT ALL ON public.game_sessions TO service_role;

CREATE TABLE public.games (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title          text                     NOT NULL,
  description    text,
  entry_fee      integer                  DEFAULT 0,
  image_url      text                     DEFAULT 'https://img.icons8.com/color/96/controller.png'::text,
  status         text                     DEFAULT 'active'::text,
  created_at     timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  category       text                     DEFAULT 'Uncategorized'::text,
  is_featured    boolean                  DEFAULT false,
  display_weight integer                  DEFAULT 0 NOT NULL,
  catalog_label  text
);

ALTER TABLE public.games
  ADD CONSTRAINT games_catalog_label_check CHECK (catalog_label IS NULL OR (catalog_label = ANY (ARRAY['hot'::text, 'new'::text, 'popular'::text, 'featured'::text])));

ALTER TABLE public.games
  ADD CONSTRAINT games_pkey PRIMARY KEY (id);

ALTER TABLE public.game_ratings
  ADD CONSTRAINT game_ratings_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;

ALTER TABLE public.games
  ADD CONSTRAINT games_status_check CHECK (status = ANY (ARRAY['active'::text, 'maintenance'::text, 'hidden'::text]));

GRANT ALL ON public.games TO anon;

GRANT ALL ON public.games TO authenticated;

GRANT ALL ON public.games TO service_role;

CREATE TABLE public.global_announcements (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title      text                     NOT NULL,
  message    text                     NOT NULL,
  type       text                     DEFAULT 'info'::text,
  is_active  boolean                  DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.global_announcements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.global_announcements
  ADD CONSTRAINT global_announcements_pkey PRIMARY KEY (id);

ALTER TABLE public.global_announcements
  ADD CONSTRAINT global_announcements_type_check CHECK (type = ANY (ARRAY['info'::text, 'alert'::text, 'maintenance'::text, 'event'::text]));

GRANT ALL ON public.global_announcements TO anon;

GRANT ALL ON public.global_announcements TO authenticated;

GRANT ALL ON public.global_announcements TO service_role;

CREATE TABLE public.legal_documents (
  slug       text                     NOT NULL,
  title      text                     NOT NULL,
  content    text                     NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

ALTER TABLE public.legal_documents
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (slug);

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_slug_check CHECK (slug = ANY (ARRAY['privacy-policy'::text, 'terms-of-service'::text]));

GRANT ALL ON public.legal_documents TO anon;

GRANT ALL ON public.legal_documents TO authenticated;

GRANT ALL ON public.legal_documents TO service_role;

CREATE POLICY "legal documents are readable" ON public.legal_documents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.ludo_match_results (
  room_id      uuid                     NOT NULL,
  winner_seat  smallint                 NOT NULL,
  completed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ludo_match_results
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ludo_match_results
  ADD CONSTRAINT ludo_match_results_pkey PRIMARY KEY (room_id);

ALTER TABLE public.ludo_match_results
  ADD CONSTRAINT ludo_match_results_winner_seat_check CHECK (winner_seat >= 1 AND winner_seat <= 4);

GRANT ALL ON public.ludo_match_results TO anon;

GRANT ALL ON public.ludo_match_results TO authenticated;

GRANT ALL ON public.ludo_match_results TO service_role;

CREATE TABLE public.ludo_match_state (
  room_id       uuid                     NOT NULL,
  state         jsonb                    NOT NULL,
  current_seat  smallint                 DEFAULT 1 NOT NULL,
  turn_deadline timestamp with time zone,
  status        text                     DEFAULT 'waiting'::text NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ludo_match_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ludo_match_state
  ADD CONSTRAINT ludo_match_state_pkey PRIMARY KEY (room_id);

GRANT ALL ON public.ludo_match_state TO anon;

GRANT ALL ON public.ludo_match_state TO authenticated;

GRANT ALL ON public.ludo_match_state TO service_role;

CREATE TRIGGER settle_ludo_four_player_result
  AFTER UPDATE OF status ON public.ludo_match_state
  FOR EACH ROW
  EXECUTE FUNCTION public.settle_four_player_result_trigger();

CREATE TABLE public.match_history (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid                     NOT NULL,
  game_id          text,
  result           text                     NOT NULL,
  match_duration   integer                  DEFAULT 0,
  kills            integer                  DEFAULT 0,
  deaths           integer                  DEFAULT 0,
  assists          integer                  DEFAULT 0,
  mmr_change       integer                  DEFAULT 0,
  created_at       timestamp with time zone DEFAULT now(),
  game_title       text,
  opponent_name    text,
  points_change    integer                  DEFAULT 0,
  duration_seconds integer                  DEFAULT 0 NOT NULL
);

ALTER TABLE public.match_history
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.match_history
  ADD CONSTRAINT match_history_duration_seconds_check CHECK (duration_seconds >= 0);

ALTER TABLE public.match_history
  ADD CONSTRAINT match_history_pkey PRIMARY KEY (id);

GRANT ALL ON public.match_history TO anon;

GRANT ALL ON public.match_history TO authenticated;

GRANT ALL ON public.match_history TO service_role;

CREATE TRIGGER match_history_xp_award
  AFTER INSERT ON public.match_history
  FOR EACH ROW
  EXECUTE FUNCTION public.award_match_xp();

CREATE POLICY "Allow users insert own match history" ON public.match_history
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Allow users select own match history" ON public.match_history
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY "Allow users update own match history" ON public.match_history
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY "System can insert match history" ON public.match_history
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own match history" ON public.match_history
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can select their own match history" ON public.match_history
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own match history" ON public.match_history
  FOR UPDATE
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own match history" ON public.match_history
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE POLICY mh_insert_policy ON public.match_history
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY mh_select_policy ON public.match_history
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY mh_update_policy ON public.match_history
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE TABLE public.match_sessions (
  match_id     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  game_key     text                     NOT NULL,
  player1_id   uuid                     NOT NULL,
  player2_id   uuid                     NOT NULL,
  player1_name text,
  player2_name text,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.match_sessions
  ADD CONSTRAINT match_sessions_pkey PRIMARY KEY (match_id);

GRANT ALL ON public.match_sessions TO anon;

GRANT ALL ON public.match_sessions TO authenticated;

GRANT ALL ON public.match_sessions TO service_role;

CREATE TABLE public.matches (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid,
  game_title     text                     NOT NULL,
  opponent_name  text,
  result         text                     DEFAULT 'In Progress'::text,
  points_changed integer                  DEFAULT 0,
  created_at     timestamp with time zone DEFAULT now()
);

ALTER TABLE public.matches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_pkey PRIMARY KEY (id);

GRANT ALL ON public.matches TO anon;

GRANT ALL ON public.matches TO authenticated;

GRANT ALL ON public.matches TO service_role;

CREATE POLICY "Users can insert their own matches" ON public.matches
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update their own matches" ON public.matches
  FOR UPDATE
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own matches" ON public.matches
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.matchmaking_queue (
  user_id    uuid                     NOT NULL,
  game_key   text                     NOT NULL,
  username   text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.matchmaking_queue
  ADD CONSTRAINT matchmaking_queue_pkey PRIMARY KEY (user_id);

GRANT ALL ON public.matchmaking_queue TO anon;

GRANT ALL ON public.matchmaking_queue TO authenticated;

GRANT ALL ON public.matchmaking_queue TO service_role;

CREATE TABLE public.matchmaking_room_players (
  room_id      uuid                     NOT NULL,
  user_id      uuid,
  seat         smallint                 NOT NULL,
  display_name text                     NOT NULL,
  avatar_url   text,
  is_bot       boolean                  DEFAULT false NOT NULL,
  connected_at timestamp with time zone DEFAULT now() NOT NULL,
  left_at      timestamp with time zone,
  ready        boolean                  DEFAULT false NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "big two members can read state" ON public.big_two_match_state
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = big_two_match_state.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE POLICY "big two players read only own hand" ON public.big_two_player_hands
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = big_two_player_hands.room_id) AND (p.seat = big_two_player_hands.seat) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE POLICY "bingo players read own card" ON public.bingo_match_cards
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = bingo_match_cards.room_id) AND (p.user_id = auth.uid()) AND (p.seat = bingo_match_cards.seat) AND (p.left_at IS NULL)))));

CREATE POLICY "dominoes players read only own hand" ON public.dominoes_match_hands
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = dominoes_match_hands.room_id) AND (p.seat = dominoes_match_hands.seat) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE POLICY "dominoes players read own hand" ON public.dominoes_match_hands
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = dominoes_match_hands.room_id) AND (p.seat = dominoes_match_hands.seat) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE POLICY "ludo members can read results" ON public.ludo_match_results
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = ludo_match_results.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE POLICY "ludo members can read state" ON public.ludo_match_state
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = ludo_match_state.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

ALTER TABLE public.matchmaking_room_players
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.matchmaking_room_players
  ADD CONSTRAINT matchmaking_room_players_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.matchmaking_room_players
  ADD CONSTRAINT matchmaking_room_players_room_id_user_id_key UNIQUE (room_id, user_id);

ALTER TABLE public.matchmaking_room_players
  ADD CONSTRAINT matchmaking_room_players_seat_check CHECK (seat >= 1 AND seat <= 4);

ALTER TABLE public.matchmaking_room_players
  ADD CONSTRAINT matchmaking_room_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT ALL ON public.matchmaking_room_players TO anon;

GRANT ALL ON public.matchmaking_room_players TO authenticated;

GRANT ALL ON public.matchmaking_room_players TO service_role;

CREATE INDEX matchmaking_room_players_room_idx ON public.matchmaking_room_players (room_id, seat);

CREATE INDEX matchmaking_room_players_presence_idx ON public.matchmaking_room_players (room_id, last_seen_at);

CREATE POLICY "matchmaking room members can read rosters" ON public.matchmaking_room_players
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.matchmaking_rooms (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  game_key    text                     NOT NULL,
  room_code   text                     NOT NULL,
  max_players smallint                 NOT NULL,
  host_id     uuid                     NOT NULL,
  status      text                     DEFAULT 'waiting'::text NOT NULL,
  fill_bots   boolean                  DEFAULT true NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  expires_at  timestamp with time zone DEFAULT (now() + '00:00:45'::interval) NOT NULL
);

ALTER TABLE public.matchmaking_rooms
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.matchmaking_rooms
  ADD CONSTRAINT matchmaking_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.matchmaking_rooms
  ADD CONSTRAINT matchmaking_rooms_max_players_check CHECK (max_players = ANY (ARRAY[2, 4]));

ALTER TABLE public.matchmaking_rooms
  ADD CONSTRAINT matchmaking_rooms_pkey PRIMARY KEY (id);

ALTER TABLE public.big_two_match_state
  ADD CONSTRAINT big_two_match_state_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.big_two_player_hands
  ADD CONSTRAINT big_two_player_hands_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.bingo_match_cards
  ADD CONSTRAINT bingo_match_cards_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.dominoes_match_hands
  ADD CONSTRAINT dominoes_match_hands_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.four_player_bot_escrow
  ADD CONSTRAINT four_player_bot_escrow_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.four_player_match_escrow
  ADD CONSTRAINT four_player_match_escrow_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.ludo_match_results
  ADD CONSTRAINT ludo_match_results_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.ludo_match_state
  ADD CONSTRAINT ludo_match_state_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.matchmaking_room_players
  ADD CONSTRAINT matchmaking_room_players_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.matchmaking_rooms
  ADD CONSTRAINT matchmaking_rooms_room_code_key UNIQUE (room_code);

ALTER TABLE public.matchmaking_rooms
  ADD CONSTRAINT matchmaking_rooms_status_check CHECK (status = ANY (ARRAY['waiting'::text, 'starting'::text, 'playing'::text, 'cancelled'::text, 'completed'::text]));

GRANT ALL ON public.matchmaking_rooms TO anon;

GRANT ALL ON public.matchmaking_rooms TO authenticated;

GRANT ALL ON public.matchmaking_rooms TO service_role;

CREATE INDEX matchmaking_rooms_queue_idx ON public.matchmaking_rooms (game_key, status, expires_at);

CREATE TRIGGER guard_four_player_paid_start
  BEFORE UPDATE OF status ON public.matchmaking_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_four_player_paid_start();

CREATE POLICY "matchmaking room members can read rooms" ON public.matchmaking_rooms
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.messages (
  id         bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  username   text                     NOT NULL,
  text       text                     NOT NULL,
  avatar     text                     NOT NULL,
  test_sync  text
);

ALTER TABLE public.messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  REPLICA IDENTITY FULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

GRANT ALL ON public.messages TO anon;

GRANT ALL ON public.messages TO authenticated;

GRANT ALL ON public.messages TO service_role;

CREATE POLICY "Allow public insert access" ON public.messages
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public read access" ON public.messages
  FOR SELECT
  USING (true);

CREATE TABLE public.monopoly_match_bot_escrow (
  room_id        uuid                     NOT NULL,
  seat           smallint                 NOT NULL,
  entry_points   bigint                   NOT NULL,
  match_currency bigint                   NOT NULL,
  status         text                     DEFAULT 'held'::text NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  settled_at     timestamp with time zone
);

ALTER TABLE public.monopoly_match_bot_escrow
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_entry_points_check CHECK (entry_points >= 0);

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_match_currency_check CHECK (match_currency >= 0);

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_pkey PRIMARY KEY (room_id, seat);

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_seat_check CHECK (seat >= 1 AND seat <= 4);

ALTER TABLE public.monopoly_match_bot_escrow
  ADD CONSTRAINT monopoly_match_bot_escrow_status_check CHECK (status = ANY (ARRAY['held'::text, 'settled'::text]));

GRANT ALL ON public.monopoly_match_bot_escrow TO anon;

GRANT ALL ON public.monopoly_match_bot_escrow TO authenticated;

GRANT ALL ON public.monopoly_match_bot_escrow TO service_role;

CREATE TABLE public.monopoly_match_escrow (
  room_id        uuid                     NOT NULL,
  user_id        uuid                     NOT NULL,
  entry_points   bigint                   NOT NULL,
  match_currency bigint                   NOT NULL,
  status         text                     DEFAULT 'held'::text NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.monopoly_match_escrow
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_entry_points_check CHECK (entry_points >= 0);

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_match_currency_check CHECK (match_currency >= 0);

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_pkey PRIMARY KEY (room_id, user_id);

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_status_check CHECK (status = ANY (ARRAY['held'::text, 'settled'::text]));

ALTER TABLE public.monopoly_match_escrow
  ADD CONSTRAINT monopoly_match_escrow_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.monopoly_match_escrow TO anon;

GRANT ALL ON public.monopoly_match_escrow TO authenticated;

GRANT ALL ON public.monopoly_match_escrow TO service_role;

CREATE POLICY "monopoly players can read own escrow" ON public.monopoly_match_escrow
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.monopoly_match_events (
  id            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  room_id       uuid                     NOT NULL,
  state_version integer                  NOT NULL,
  actor_id      uuid                     NOT NULL,
  action        text                     NOT NULL,
  summary       text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.monopoly_match_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monopoly_match_events
  ADD CONSTRAINT monopoly_match_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.monopoly_match_events
  ADD CONSTRAINT monopoly_match_events_pkey PRIMARY KEY (id);

GRANT ALL ON public.monopoly_match_events TO anon;

GRANT ALL ON public.monopoly_match_events TO authenticated;

GRANT ALL ON public.monopoly_match_events TO service_role;

CREATE POLICY "monopoly room members can read events" ON public.monopoly_match_events
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = monopoly_match_events.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE TABLE public.monopoly_match_state (
  room_id          uuid                     NOT NULL,
  state            jsonb                    NOT NULL,
  active_player_id uuid,
  turn_deadline    timestamp with time zone DEFAULT (now() + '00:01:00'::interval) NOT NULL,
  version          integer                  DEFAULT 1 NOT NULL,
  status           text                     DEFAULT 'playing'::text NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.monopoly_match_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monopoly_match_state
  ADD CONSTRAINT monopoly_match_state_pkey PRIMARY KEY (room_id);

ALTER TABLE public.monopoly_match_events
  ADD CONSTRAINT monopoly_match_events_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.monopoly_match_state(room_id) ON DELETE CASCADE;

ALTER TABLE public.monopoly_match_state
  ADD CONSTRAINT monopoly_match_state_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.monopoly_match_state
  ADD CONSTRAINT monopoly_match_state_status_check CHECK (status = ANY (ARRAY['playing'::text, 'completed'::text, 'abandoned'::text]));

GRANT ALL ON public.monopoly_match_state TO anon;

GRANT ALL ON public.monopoly_match_state TO authenticated;

GRANT ALL ON public.monopoly_match_state TO service_role;

CREATE POLICY "monopoly room members can read board state" ON public.monopoly_match_state
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = monopoly_match_state.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE TABLE public.monopoly_turn_rolls (
  room_id       uuid                     NOT NULL,
  state_version integer                  NOT NULL,
  player_id     uuid                     NOT NULL,
  die_one       smallint                 NOT NULL,
  die_two       smallint                 NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.monopoly_turn_rolls
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monopoly_turn_rolls
  ADD CONSTRAINT monopoly_turn_rolls_die_one_check CHECK (die_one >= 1 AND die_one <= 6);

ALTER TABLE public.monopoly_turn_rolls
  ADD CONSTRAINT monopoly_turn_rolls_die_two_check CHECK (die_two >= 1 AND die_two <= 6);

ALTER TABLE public.monopoly_turn_rolls
  ADD CONSTRAINT monopoly_turn_rolls_pkey PRIMARY KEY (room_id, state_version);

ALTER TABLE public.monopoly_turn_rolls
  ADD CONSTRAINT monopoly_turn_rolls_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.monopoly_match_state(room_id) ON DELETE CASCADE;

GRANT ALL ON public.monopoly_turn_rolls TO anon;

GRANT ALL ON public.monopoly_turn_rolls TO authenticated;

GRANT ALL ON public.monopoly_turn_rolls TO service_role;

CREATE POLICY "monopoly room members can read dice" ON public.monopoly_turn_rolls
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = monopoly_turn_rolls.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE TABLE public.network_connections (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  sender_id   uuid,
  receiver_id uuid,
  status      text,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.network_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.network_connections
  ADD CONSTRAINT network_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.network_connections
  ADD CONSTRAINT network_connections_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);

ALTER TABLE public.network_connections
  ADD CONSTRAINT network_connections_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text]));

GRANT ALL ON public.network_connections TO anon;

GRANT ALL ON public.network_connections TO authenticated;

GRANT ALL ON public.network_connections TO service_role;

CREATE TABLE public.platform_config (
  id                       integer                  DEFAULT 1 NOT NULL,
  maintenance_mode         boolean                  DEFAULT false,
  maintenance_message      text                     DEFAULT 'The arcade is currently under scheduled maintenance. We will be back online shortly!'::text,
  global_point_multiplier  numeric                  DEFAULT 1.0,
  signups_enabled          boolean                  DEFAULT true,
  redemptions_enabled      boolean                  DEFAULT true,
  leaderboards_enabled     boolean                  DEFAULT true,
  support_email            text                     DEFAULT 'support@joeyoke.com'::text,
  updated_at               timestamp with time zone DEFAULT now(),
  profile_edit_cost        integer                  DEFAULT 100 NOT NULL,
  profile_edit_currency    text                     DEFAULT 'points'::text NOT NULL,
  wheel_spin_cost          integer                  DEFAULT 20 NOT NULL,
  wheel_spin_currency      text                     DEFAULT 'points'::text NOT NULL,
  referral_inviter_points  integer                  DEFAULT 500 NOT NULL,
  referral_inviter_gems    integer                  DEFAULT 10 NOT NULL,
  referral_new_user_points integer                  DEFAULT 100 NOT NULL
);

ALTER TABLE public.platform_config
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_id_check CHECK (id = 1);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_pkey PRIMARY KEY (id);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_profile_edit_currency_check CHECK (profile_edit_currency = ANY (ARRAY['points'::text, 'gems'::text]));

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_referral_inviter_gems_check CHECK (referral_inviter_gems >= 0);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_referral_inviter_points_check CHECK (referral_inviter_points >= 0);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_referral_new_user_points_check CHECK (referral_new_user_points >= 0);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_wheel_spin_cost_check CHECK (wheel_spin_cost >= 0);

ALTER TABLE public.platform_config
  ADD CONSTRAINT platform_config_wheel_spin_currency_check CHECK (wheel_spin_currency = ANY (ARRAY['points'::text, 'gems'::text]));

GRANT ALL ON public.platform_config TO anon;

GRANT ALL ON public.platform_config TO authenticated;

GRANT ALL ON public.platform_config TO service_role;

CREATE TABLE public.profiles (
  id                     uuid                     NOT NULL,
  email                  text                     NOT NULL,
  username               text,
  avatar_url             text,
  created_at             timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  points                 integer                  DEFAULT 0,
  last_login_claim       timestamp with time zone,
  role                   public.app_role          DEFAULT 'player'::public.app_role,
  bio                    text                     DEFAULT ''::text,
  region                 text                     DEFAULT 'US-EAST'::text,
  language               text                     DEFAULT 'en'::text,
  is_banned              boolean                  DEFAULT false,
  online_presence        boolean                  DEFAULT false,
  current_game_url       text,
  mmr                    integer                  DEFAULT 1000,
  total_wins             integer                  DEFAULT 0,
  total_matches          integer                  DEFAULT 0,
  total_kills            integer                  DEFAULT 0,
  total_deaths           integer                  DEFAULT 0,
  total_assists          integer                  DEFAULT 0,
  total_playtime_seconds integer                  DEFAULT 0,
  display_name           text,
  allowed_modules        text[]                   DEFAULT ARRAY['dashboard'::text,
  'games'::text,
  'tournaments'::text,
  'store'::text,
  'users'::text,
  'community'::text,
  'rewards'::text,
  'badges'::text,
  'economy'::text,
  'redeem'::text,
  'ads'::text,
  'notifications'::text,
  'analytics'::text,
  'roles'::text,
  'configurations'::text],
  last_daily_claim_at    timestamp with time zone,
  gems                   integer                  DEFAULT 0,
  last_spin              timestamp with time zone,
  name_change_count      integer                  DEFAULT 0 NOT NULL,
  avatar_change_count    integer                  DEFAULT 0 NOT NULL,
  push_enabled           boolean                  DEFAULT false NOT NULL,
  last_seen_at           timestamp with time zone DEFAULT now() NOT NULL,
  profile_edit_count     integer                  DEFAULT 0 NOT NULL,
  network_id             text                     NOT NULL,
  referral_code          text                     NOT NULL,
  referred_by            uuid,
  xp                     bigint                   DEFAULT 0 NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.checkers_matches,
  TABLE public.direct_messages, TABLE public.game_invites, TABLE public.match_history, TABLE public.messages, TABLE public.profiles;

CREATE FUNCTION public.update_profile_identity (
  new_username   text DEFAULT NULL::text,
  new_avatar_url text DEFAULT NULL::text
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  current_profile public.profiles;
  settings public.platform_config;
  changed boolean := false;
  charge integer := 0;
begin
  select * into current_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into settings from public.platform_config where id = 1;

  new_username := nullif(btrim(coalesce(new_username, '')), '');
  if new_username is null then new_username := current_profile.username; end if;
  if length(new_username) > 30 then raise exception 'Display name must be 30 characters or fewer'; end if;
  new_avatar_url := nullif(btrim(coalesce(new_avatar_url, '')), '');

  changed := new_username <> current_profile.username
    or new_avatar_url is distinct from current_profile.avatar_url;
  if not changed then return current_profile; end if;

  if current_profile.profile_edit_count > 0 then
    charge := greatest(coalesce(settings.profile_edit_cost, 100), 0);
    if coalesce(settings.profile_edit_currency, 'points') = 'gems' then
      if coalesce(current_profile.gems, 0) < charge then raise exception 'Insufficient gems'; end if;
    elsif coalesce(current_profile.points, 0) < charge then
      raise exception 'Insufficient points';
    end if;
  end if;

  update public.profiles
  set username = new_username,
      avatar_url = new_avatar_url,
      points = coalesce(points, 0) - case when coalesce(settings.profile_edit_currency, 'points') = 'points' then charge else 0 end,
      gems = coalesce(gems, 0) - case when coalesce(settings.profile_edit_currency, 'points') = 'gems' then charge else 0 end,
      profile_edit_count = profile_edit_count + 1
  where id = auth.uid()
  returning * into current_profile;

  if charge > 0 then
    insert into public.wallet_activity_logs (user_id, amount, balance_snapshot, currency_type, activity_type, description)
    values (
      auth.uid(), -charge,
      case when coalesce(settings.profile_edit_currency, 'points') = 'gems' then current_profile.gems else current_profile.points end,
      coalesce(settings.profile_edit_currency, 'points'), 'profile_update', 'Profile appearance update'
    );
  end if;
  return current_profile;
end;
$function$;

REVOKE ALL ON FUNCTION public.update_profile_identity(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.update_profile_identity(text, text) TO anon;

GRANT ALL ON FUNCTION public.update_profile_identity(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.update_profile_identity(text, text) TO service_role;

CREATE POLICY "admins manage account requests" ON public.account_requests
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "Admins full access on ad_banners" ON public.ad_banners
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE POLICY "Admins full access on community_reports" ON public.community_reports
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE POLICY "Admins full access on global_announcements" ON public.global_announcements
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE POLICY "admins manage legal documents" ON public.legal_documents
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "Admins full access on platform_config" ON public.platform_config
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

COMMENT ON COLUMN public.profiles.network_id IS 'Permanent, case-insensitive unique player identifier generated from the account name.';

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  REPLICA IDENTITY FULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT points_non_negative CHECK (points >= 0);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

ALTER TABLE public.account_requests
  ADD CONSTRAINT account_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_group_messages
  ADD CONSTRAINT chat_group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chat_groups
  ADD CONSTRAINT chat_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.competitive_match_stakes
  ADD CONSTRAINT competitive_match_stakes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.daily_claims
  ADD CONSTRAINT daily_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT financial_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.four_player_match_escrow
  ADD CONSTRAINT four_player_match_escrow_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.game_favorites
  ADD CONSTRAINT game_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.game_invites
  ADD CONSTRAINT game_invites_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);

ALTER TABLE public.game_ratings
  ADD CONSTRAINT game_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);

ALTER TABLE public.match_history
  ADD CONSTRAINT match_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.network_connections
  ADD CONSTRAINT network_connections_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.network_connections
  ADD CONSTRAINT network_connections_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_xp_check CHECK (xp >= 0);

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE INDEX profiles_xp_leaderboard_idx ON public.profiles (xp DESC NULLS LAST);

CREATE INDEX profiles_points_leaderboard_idx ON public.profiles (points DESC NULLS LAST);

CREATE UNIQUE INDEX profiles_network_id_unique ON public.profiles (lower(network_id));

CREATE UNIQUE INDEX profiles_referral_code_unique ON public.profiles (lower(referral_code));

CREATE INDEX profiles_xp_leaderboard_page_idx ON public.profiles (xp DESC NULLS LAST, created_at, id);

CREATE TRIGGER profiles_assign_network_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_profile_network_id();

CREATE TRIGGER profiles_assign_referral_code
  BEFORE INSERT OR UPDATE OF referral_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_profile_referral_code();

CREATE TRIGGER wallet_activity_audit
  AFTER UPDATE OF points, gems ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_wallet_balance_change();

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
  FOR SELECT
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can delete their own profile" ON public.profiles
  FOR DELETE
  USING ((auth.uid() = id));

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update their own profile." ON public.profiles
  FOR UPDATE
  USING ((auth.uid() = id));

CREATE TABLE public.push_broadcasts (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title              text                     NOT NULL,
  message            text                     NOT NULL,
  audience           text                     DEFAULT 'all'::text NOT NULL,
  category           text                     DEFAULT 'general'::text NOT NULL,
  action_url         text,
  recipients_count   integer                  DEFAULT 0 NOT NULL,
  status             text                     DEFAULT 'delivered'::text NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  action_label       text,
  show_in_app_dialog boolean                  DEFAULT true NOT NULL
);

ALTER TABLE public.push_broadcasts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_broadcasts
  ADD CONSTRAINT push_broadcasts_audience_check CHECK (audience = ANY (ARRAY['all'::text, 'ranked'::text, 'vip'::text]));

ALTER TABLE public.push_broadcasts
  ADD CONSTRAINT push_broadcasts_category_check CHECK (category = ANY (ARRAY['general'::text, 'system'::text, 'promotion'::text]));

ALTER TABLE public.push_broadcasts
  ADD CONSTRAINT push_broadcasts_pkey PRIMARY KEY (id);

GRANT ALL ON public.push_broadcasts TO anon;

GRANT ALL ON public.push_broadcasts TO authenticated;

GRANT ALL ON public.push_broadcasts TO service_role;

CREATE INDEX push_broadcasts_created_idx ON public.push_broadcasts (created_at DESC);

CREATE POLICY "admins manage broadcasts" ON public.push_broadcasts
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "authenticated read broadcasts" ON public.push_broadcasts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.rank_badges (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name        text                     NOT NULL,
  min_points  integer                  DEFAULT 0 NOT NULL,
  tier_level  integer                  DEFAULT 1 NOT NULL,
  color_hex   text                     DEFAULT '#CCFF00'::text,
  description text,
  icon_url    text,
  is_active   boolean                  DEFAULT true,
  created_at  timestamp with time zone DEFAULT now(),
  rank_key    text
);

ALTER TABLE public.rank_badges
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rank_badges
  ADD CONSTRAINT rank_badges_pkey PRIMARY KEY (id);

GRANT ALL ON public.rank_badges TO anon;

GRANT ALL ON public.rank_badges TO authenticated;

GRANT ALL ON public.rank_badges TO service_role;

CREATE UNIQUE INDEX rank_badges_rank_key_unique ON public.rank_badges (rank_key)
  WHERE rank_key IS NOT NULL;

CREATE POLICY "Admins full access on rank_badges" ON public.rank_badges
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE TABLE public.referral_milestone_rules (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  invitee_target integer                  NOT NULL,
  reward_points  integer                  DEFAULT 0 NOT NULL,
  reward_gems    integer                  DEFAULT 0 NOT NULL,
  is_active      boolean                  DEFAULT true NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.referral_milestone_rules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_check CHECK (reward_points > 0 OR reward_gems > 0);

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_invitee_target_check CHECK (invitee_target > 0);

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_invitee_target_key UNIQUE (invitee_target);

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_reward_gems_check CHECK (reward_gems >= 0);

ALTER TABLE public.referral_milestone_rules
  ADD CONSTRAINT referral_milestone_rules_reward_points_check CHECK (reward_points >= 0);

GRANT ALL ON public.referral_milestone_rules TO anon;

GRANT ALL ON public.referral_milestone_rules TO authenticated;

GRANT ALL ON public.referral_milestone_rules TO service_role;

CREATE POLICY "admins manage referral milestone rules" ON public.referral_milestone_rules
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "players view active referral milestone rules" ON public.referral_milestone_rules
  FOR SELECT
  TO authenticated
  USING ((is_active = true));

CREATE TABLE public.referral_purchase_rules (
  id                      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  minimum_purchase_amount numeric(12,2)            NOT NULL,
  purchase_currency       text                     DEFAULT 'usd'::text NOT NULL,
  reward_points           integer                  DEFAULT 0 NOT NULL,
  reward_gems             integer                  DEFAULT 0 NOT NULL,
  is_active               boolean                  DEFAULT true NOT NULL,
  created_at              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.referral_purchase_rules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_purchase_rules
  ADD CONSTRAINT referral_purchase_rules_check CHECK (reward_points > 0 OR reward_gems > 0);

ALTER TABLE public.referral_purchase_rules
  ADD CONSTRAINT referral_purchase_rules_minimum_purchase_amount_check CHECK (minimum_purchase_amount > 0::numeric);

ALTER TABLE public.referral_purchase_rules
  ADD CONSTRAINT referral_purchase_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_purchase_rules
  ADD CONSTRAINT referral_purchase_rules_reward_gems_check CHECK (reward_gems >= 0);

ALTER TABLE public.referral_purchase_rules
  ADD CONSTRAINT referral_purchase_rules_reward_points_check CHECK (reward_points >= 0);

GRANT ALL ON public.referral_purchase_rules TO anon;

GRANT ALL ON public.referral_purchase_rules TO authenticated;

GRANT ALL ON public.referral_purchase_rules TO service_role;

CREATE POLICY "admins manage referral purchase rules" ON public.referral_purchase_rules
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "players view active referral purchase rules" ON public.referral_purchase_rules
  FOR SELECT
  TO authenticated
  USING ((is_active = true));

CREATE TABLE public.referral_reward_grants (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  inviter_id    uuid                     NOT NULL,
  invitee_id    uuid,
  rule_type     text                     NOT NULL,
  rule_id       uuid                     NOT NULL,
  purchase_id   text,
  reward_points integer                  DEFAULT 0 NOT NULL,
  reward_gems   integer                  DEFAULT 0 NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.referral_reward_grants
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_inviter_id_rule_type_rule_id_invitee_key UNIQUE (inviter_id, rule_type, rule_id, invitee_id);

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_purchase_id_rule_id_key UNIQUE (purchase_id, rule_id);

ALTER TABLE public.referral_reward_grants
  ADD CONSTRAINT referral_reward_grants_rule_type_check CHECK (rule_type = ANY (ARRAY['milestone'::text, 'purchase'::text]));

GRANT ALL ON public.referral_reward_grants TO anon;

GRANT ALL ON public.referral_reward_grants TO authenticated;

GRANT ALL ON public.referral_reward_grants TO service_role;

CREATE UNIQUE INDEX referral_milestone_once_per_inviter_idx ON public.referral_reward_grants (inviter_id, rule_id)
  WHERE rule_type = 'milestone'::text;

CREATE POLICY "admins view referral grants" ON public.referral_reward_grants
  FOR SELECT
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "users view own referral grants" ON public.referral_reward_grants
  FOR SELECT
  TO authenticated
  USING ((inviter_id = auth.uid()));

CREATE TABLE public.reward_rules (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title         text                     NOT NULL,
  trigger_event text                     NOT NULL,
  reward_points integer                  NOT NULL,
  description   text,
  is_active     boolean                  DEFAULT true,
  created_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE public.reward_rules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reward_rules
  ADD CONSTRAINT reward_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.reward_rules
  ADD CONSTRAINT reward_rules_reward_points_check CHECK (reward_points >= 0);

ALTER TABLE public.reward_rules
  ADD CONSTRAINT reward_rules_trigger_event_check
    CHECK (trigger_event = ANY (ARRAY['daily_login'::text, 'game_played'::text, 'tournament_win'::text, 'streak_7d'::text, 'referral'::text, 'custom'::text]));

GRANT ALL ON public.reward_rules TO anon;

GRANT ALL ON public.reward_rules TO authenticated;

GRANT ALL ON public.reward_rules TO service_role;

CREATE POLICY "Admins full access on reward_rules" ON public.reward_rules
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE TABLE public.splash_campaigns (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title             text                     NOT NULL,
  message           text                     DEFAULT ''::text NOT NULL,
  image_url         text,
  action_label      text,
  action_url        text,
  display_seconds   integer                  DEFAULT 5 NOT NULL,
  show_every_launch boolean                  DEFAULT false NOT NULL,
  is_active         boolean                  DEFAULT false NOT NULL,
  starts_at         timestamp with time zone,
  ends_at           timestamp with time zone,
  created_by        uuid,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.splash_campaigns
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_display_seconds_check CHECK (display_seconds >= 0 AND display_seconds <= 30);

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_message_check CHECK (char_length(message) <= 240);

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_pkey PRIMARY KEY (id);

ALTER TABLE public.splash_campaigns
  ADD CONSTRAINT splash_campaigns_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 80);

GRANT ALL ON public.splash_campaigns TO anon;

GRANT ALL ON public.splash_campaigns TO authenticated;

GRANT ALL ON public.splash_campaigns TO service_role;

CREATE INDEX splash_campaigns_active_window_idx ON public.splash_campaigns (is_active, starts_at, ends_at, created_at DESC);

CREATE POLICY "admins manage splash campaigns" ON public.splash_campaigns
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "public reads active splash campaigns" ON public.splash_campaigns
  FOR SELECT
  TO anon, authenticated
  USING ((is_active AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now()))));

CREATE TABLE public.store_items (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  created_at          timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  name                text                     NOT NULL,
  description         text,
  sku                 text                     NOT NULL,
  category            text                     NOT NULL,
  price_points        integer                  DEFAULT 0 NOT NULL,
  stock_quantity      integer                  DEFAULT '-1'::integer NOT NULL,
  image_url           text,
  is_active           boolean                  DEFAULT true NOT NULL,
  price_currency      text                     DEFAULT 'points'::text NOT NULL,
  price_fiat          numeric,
  cosmetic_type       text                     DEFAULT 'game_cosmetic'::text NOT NULL,
  profile_card_layout text                     DEFAULT 'centered'::text NOT NULL,
  game_target         text
);

COMMENT ON COLUMN public.store_items.cosmetic_type IS 'Digital cosmetic target: game_cosmetic (1:1), profile_card (16:9), or avatar_frame (1:1 transparent PNG/WebP with transparent centre).';

COMMENT ON COLUMN public.store_items.profile_card_layout IS 'Profile-card artwork layout. avatar_left reserves the avatar centre at 27% horizontal / 50% vertical; centered uses the standard card composition.';

COMMENT ON COLUMN public.store_items.game_target IS 'Target game key for a game_cosmetic. Only one equipped cosmetic is allowed per target game.';

ALTER TABLE public.store_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_category_check CHECK (category = ANY (ARRAY['digital'::text, 'physical'::text, 'currency'::text]));

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_cosmetic_type_check CHECK (cosmetic_type = ANY (ARRAY['game_cosmetic'::text, 'profile_card'::text, 'avatar_frame'::text]));

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_game_target_format_check CHECK (game_target IS NULL OR game_target ~ '^[a-z0-9_]{2,64}$'::text);

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_pkey PRIMARY KEY (id);

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_profile_card_layout_check CHECK (profile_card_layout = ANY (ARRAY['centered'::text, 'avatar_left'::text]));

ALTER TABLE public.store_items
  ADD CONSTRAINT store_items_sku_key UNIQUE (sku);

GRANT ALL ON public.store_items TO anon;

GRANT ALL ON public.store_items TO authenticated;

GRANT ALL ON public.store_items TO service_role;

CREATE POLICY "Allow admin full access" ON public.store_items
  USING ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))));

CREATE POLICY "Allow public read access for active items" ON public.store_items
  FOR SELECT
  USING ((is_active = true));

CREATE TABLE public.store_products (
  id            uuid                DEFAULT gen_random_uuid() NOT NULL,
  title         text                NOT NULL,
  type          public.product_type NOT NULL,
  cost_credits  integer             NOT NULL,
  fiat_cost_usd numeric(6,2)        DEFAULT 0.00,
  metadata      jsonb               DEFAULT '{}'::jsonb,
  is_active     boolean             DEFAULT true
);

ALTER TABLE public.store_products
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_products
  ADD CONSTRAINT store_products_cost_credits_check CHECK (cost_credits >= 0);

ALTER TABLE public.store_products
  ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);

GRANT ALL ON public.store_products TO anon;

GRANT ALL ON public.store_products TO authenticated;

GRANT ALL ON public.store_products TO service_role;

CREATE TABLE public.store_redemptions (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid,
  user_email   text,
  item_id      uuid,
  item_name    text                     NOT NULL,
  points_spent integer                  NOT NULL,
  status       text                     DEFAULT 'pending'::text NOT NULL,
  notes        text,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.store_redemptions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_redemptions
  ADD CONSTRAINT store_redemptions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.store_items(id) ON DELETE SET NULL;

ALTER TABLE public.store_redemptions
  ADD CONSTRAINT store_redemptions_pkey PRIMARY KEY (id);

ALTER TABLE public.store_redemptions
  ADD CONSTRAINT store_redemptions_points_spent_check CHECK (points_spent >= 0);

ALTER TABLE public.store_redemptions
  ADD CONSTRAINT store_redemptions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'rejected'::text]));

ALTER TABLE public.store_redemptions
  ADD CONSTRAINT store_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.store_redemptions TO anon;

GRANT ALL ON public.store_redemptions TO authenticated;

GRANT ALL ON public.store_redemptions TO service_role;

CREATE POLICY "Admins full access on store_redemptions" ON public.store_redemptions
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role]))))));

CREATE TABLE public.support_faqs (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  question     text                     NOT NULL,
  answer       text                     NOT NULL,
  sort_order   integer                  DEFAULT 0 NOT NULL,
  is_published boolean                  DEFAULT true NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.support_faqs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_faqs
  ADD CONSTRAINT support_faqs_pkey PRIMARY KEY (id);

GRANT ALL ON public.support_faqs TO anon;

GRANT ALL ON public.support_faqs TO authenticated;

GRANT ALL ON public.support_faqs TO service_role;

CREATE POLICY "admins manage FAQs" ON public.support_faqs
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "published FAQs are readable" ON public.support_faqs
  FOR SELECT
  TO authenticated
  USING ((is_published = true));

CREATE TABLE public.support_tickets (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id     uuid                     NOT NULL,
  subject     text                     NOT NULL,
  message     text                     NOT NULL,
  status      text                     DEFAULT 'open'::text NOT NULL,
  admin_reply text,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.support_tickets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]));

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.support_tickets TO anon;

GRANT ALL ON public.support_tickets TO authenticated;

GRANT ALL ON public.support_tickets TO service_role;

CREATE POLICY "admins manage support tickets" ON public.support_tickets
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "users create support tickets" ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "users read their support tickets" ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.system_audit_logs (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_id     uuid,
  action_token text                     NOT NULL,
  target_id    text,
  payload      jsonb                    DEFAULT '{}'::jsonb,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_audit_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_audit_logs
  ADD CONSTRAINT system_audit_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.system_audit_logs TO anon;

GRANT ALL ON public.system_audit_logs TO authenticated;

GRANT ALL ON public.system_audit_logs TO service_role;

CREATE TABLE public.system_settings (
  key        text                     NOT NULL,
  value      jsonb                    NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.system_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);

GRANT ALL ON public.system_settings TO anon;

GRANT ALL ON public.system_settings TO authenticated;

GRANT ALL ON public.system_settings TO service_role;

CREATE TABLE public.tournament_awards (
  id            uuid    DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid    NOT NULL,
  placement     integer NOT NULL,
  points        integer DEFAULT 0 NOT NULL,
  gems          integer DEFAULT 0 NOT NULL,
  badge_id      uuid
);

ALTER TABLE public.tournament_awards
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_awards
  ADD CONSTRAINT tournament_awards_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.rank_badges(id);

ALTER TABLE public.tournament_awards
  ADD CONSTRAINT tournament_awards_pkey PRIMARY KEY (id);

ALTER TABLE public.tournament_awards
  ADD CONSTRAINT tournament_awards_tournament_id_placement_key UNIQUE (tournament_id, placement);

GRANT ALL ON public.tournament_awards TO anon;

GRANT ALL ON public.tournament_awards TO authenticated;

GRANT ALL ON public.tournament_awards TO service_role;

CREATE POLICY "admins manage awards" ON public.tournament_awards
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "awards are readable" ON public.tournament_awards
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.tournament_entries (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  tournament_id  uuid                     NOT NULL,
  user_id        uuid                     NOT NULL,
  status         text                     DEFAULT 'registered'::text NOT NULL,
  placement      integer,
  score          integer                  DEFAULT 0 NOT NULL,
  joined_at      timestamp with time zone DEFAULT now() NOT NULL,
  completed_at   timestamp with time zone,
  game_results   jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  matches_played integer                  DEFAULT 0 NOT NULL,
  wins           integer                  DEFAULT 0 NOT NULL,
  draws          integer                  DEFAULT 0 NOT NULL,
  losses         integer                  DEFAULT 0 NOT NULL
);

CREATE FUNCTION public.register_for_tournament (
  target_tournament uuid
)
  RETURNS public.tournament_entries
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  event public.tournaments;
  entrant public.profiles;
  entry public.tournament_entries;
  entry_fee_amount numeric := 0;
begin
  select * into event from public.tournaments where id = target_tournament for update;
  if not found or event.status not in ('upcoming', 'active') then raise exception 'Tournament is not open for registration'; end if;
  if coalesce(event.current_slots, 0) >= event.max_slots then raise exception 'Tournament is full'; end if;
  if coalesce(event.entry_fee::text, '') ~ '^[0-9]+([.][0-9]+)?$' then entry_fee_amount := event.entry_fee::text::numeric; end if;

  select * into entrant from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Player profile not found'; end if;
  if entry_fee_amount > 0 and event.entry_fee_currency = 'points' and coalesce(entrant.points, 0) < entry_fee_amount then raise exception 'Not enough points for this tournament entry fee'; end if;
  if entry_fee_amount > 0 and event.entry_fee_currency = 'gems' and coalesce(entrant.gems, 0) < entry_fee_amount then raise exception 'Not enough gems for this tournament entry fee'; end if;

  insert into public.tournament_entries(tournament_id, user_id) values(target_tournament, auth.uid()) returning * into entry;
  if entry_fee_amount > 0 then
    perform set_config('app.wallet_activity_type', 'tournament_entry_fee', true);
    perform set_config('app.wallet_activity_description', 'Tournament entry fee: ' || event.title, true);
    if event.entry_fee_currency = 'points' then update public.profiles set points = coalesce(points, 0) - entry_fee_amount where id = auth.uid();
    else update public.profiles set gems = coalesce(gems, 0) - entry_fee_amount where id = auth.uid(); end if;
  end if;
  update public.tournaments set current_slots = coalesce(current_slots, 0) + 1 where id = target_tournament;
  return entry;
end;
$function$;

GRANT ALL ON FUNCTION public.register_for_tournament(uuid) TO anon;

GRANT ALL ON FUNCTION public.register_for_tournament(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.register_for_tournament(uuid) TO service_role;

ALTER TABLE public.tournament_entries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_status_check CHECK (status = ANY (ARRAY['registered'::text, 'participated'::text, 'eliminated'::text, 'winner'::text]));

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_tournament_id_user_id_key UNIQUE (tournament_id, user_id);

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.tournament_entries TO anon;

GRANT ALL ON public.tournament_entries TO authenticated;

GRANT ALL ON public.tournament_entries TO service_role;

CREATE INDEX tournament_entries_user_idx ON public.tournament_entries (user_id, joined_at DESC);

CREATE POLICY "admins manage entries" ON public.tournament_entries
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "players read entries" ON public.tournament_entries
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "players register themselves" ON public.tournament_entries
  FOR INSERT
  TO authenticated
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.tournament_matches (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  tournament_id    uuid                     NOT NULL,
  round_number     integer                  NOT NULL,
  game_name        text                     NOT NULL,
  player_one_id    uuid                     NOT NULL,
  player_two_id    uuid                     NOT NULL,
  winner_id        uuid,
  status           text                     DEFAULT 'scheduled'::text NOT NULL,
  player_one_score integer                  DEFAULT 0 NOT NULL,
  player_two_score integer                  DEFAULT 0 NOT NULL,
  completed_at     timestamp with time zone,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

CREATE FUNCTION public.record_tournament_match_result (
  target_match           uuid,
  result                 text,
  player_one_score_value integer DEFAULT 0,
  player_two_score_value integer DEFAULT 0
)
  RETURNS public.tournament_matches
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  fixture public.tournament_matches;
  event public.tournaments;
begin
  if (select role from public.profiles where id = auth.uid()) not in ('admin', 'super_admin') then raise exception 'Admin access required'; end if;
  if result not in ('player_one', 'player_two', 'draw') then raise exception 'Result must be player_one, player_two, or draw'; end if;
  select * into fixture from public.tournament_matches where id = target_match for update;
  if not found then raise exception 'Fixture not found'; end if;
  if fixture.status = 'completed' then raise exception 'Fixture already completed'; end if;
  select * into event from public.tournaments where id = fixture.tournament_id;

  update public.tournament_matches set
    status = 'completed', completed_at = now(), player_one_score = player_one_score_value, player_two_score = player_two_score_value,
    winner_id = case when result = 'player_one' then fixture.player_one_id when result = 'player_two' then fixture.player_two_id else null end
  where id = target_match returning * into fixture;

  if result = 'draw' then
    update public.tournament_entries set score = score + event.draw_points, matches_played = matches_played + 1, draws = draws + 1
    where tournament_id = fixture.tournament_id and user_id in (fixture.player_one_id, fixture.player_two_id);
  else
    update public.tournament_entries set score = score + event.win_points, matches_played = matches_played + 1, wins = wins + 1
    where tournament_id = fixture.tournament_id and user_id = fixture.winner_id;
    update public.tournament_entries set score = score + event.loss_points, matches_played = matches_played + 1, losses = losses + 1
    where tournament_id = fixture.tournament_id and user_id = case when fixture.winner_id = fixture.player_one_id then fixture.player_two_id else fixture.player_one_id end;
  end if;
  return fixture;
end;
$function$;

GRANT ALL ON FUNCTION public.record_tournament_match_result(uuid, text, integer, integer) TO anon;

GRANT ALL ON FUNCTION public.record_tournament_match_result(uuid, text, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.record_tournament_match_result(uuid, text, integer, integer) TO service_role;

ALTER TABLE public.tournament_matches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_check CHECK (player_one_id <> player_two_id);

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_pkey PRIMARY KEY (id);

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_player_one_id_fkey FOREIGN KEY (player_one_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_player_two_id_fkey FOREIGN KEY (player_two_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_tournament_id_round_number_player_one_id_key UNIQUE (tournament_id, round_number, player_one_id);

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_tournament_id_round_number_player_two_id_key UNIQUE (tournament_id, round_number, player_two_id);

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

GRANT ALL ON public.tournament_matches TO anon;

GRANT ALL ON public.tournament_matches TO authenticated;

GRANT ALL ON public.tournament_matches TO service_role;

CREATE INDEX tournament_matches_event_round_idx ON public.tournament_matches (tournament_id, round_number, status);

CREATE POLICY "admins manage tournament matches" ON public.tournament_matches
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "players read tournament matches" ON public.tournament_matches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.tournament_registrations (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  tournament_id uuid                     NOT NULL,
  user_id       uuid                     NOT NULL,
  registered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tournament_registrations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_pkey PRIMARY KEY (id);

ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_tournament_id_user_id_key UNIQUE (tournament_id, user_id);

ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.tournament_registrations TO anon;

GRANT ALL ON public.tournament_registrations TO authenticated;

GRANT ALL ON public.tournament_registrations TO service_role;

CREATE POLICY "Allow users to register for tournaments" ON public.tournament_registrations
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Allow users to view their registrations" ON public.tournament_registrations
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.tournaments (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  title                  text                     NOT NULL,
  game_title             text                     NOT NULL,
  prize_pool             text                     NOT NULL,
  entry_fee              text                     NOT NULL,
  max_slots              integer                  DEFAULT 32,
  current_slots          integer                  DEFAULT 0,
  status                 text                     DEFAULT 'upcoming'::text,
  created_at             timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  rules                  text                     DEFAULT ''::text NOT NULL,
  terms                  text                     DEFAULT ''::text NOT NULL,
  participation_points   integer                  DEFAULT 0 NOT NULL,
  participation_gems     integer                  DEFAULT 0 NOT NULL,
  participation_badge_id uuid,
  games                  text[]                   DEFAULT '{}'::text[] NOT NULL,
  start_date             timestamp with time zone,
  prize_currency         text                     DEFAULT 'points'::text NOT NULL,
  entry_fee_currency     text                     DEFAULT 'gems'::text NOT NULL,
  card_image_url         text,
  win_points             integer                  DEFAULT 3 NOT NULL,
  draw_points            integer                  DEFAULT 1 NOT NULL,
  loss_points            integer                  DEFAULT '-1'::integer NOT NULL,
  current_round          integer                  DEFAULT 0 NOT NULL
);

ALTER TABLE public.tournaments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_entry_fee_currency_check CHECK (entry_fee_currency = ANY (ARRAY['points'::text, 'gems'::text]));

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_participation_badge_id_fkey FOREIGN KEY (participation_badge_id) REFERENCES public.rank_badges(id);

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);

ALTER TABLE public.tournament_awards
  ADD CONSTRAINT tournament_awards_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_entries
  ADD CONSTRAINT tournament_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_prize_currency_check CHECK (prize_currency = ANY (ARRAY['points'::text, 'gems'::text]));

GRANT ALL ON public.tournaments TO anon;

GRANT ALL ON public.tournaments TO authenticated;

GRANT ALL ON public.tournaments TO service_role;

CREATE POLICY "Allow public read access to tournaments" ON public.tournaments
  FOR SELECT
  USING (true);

CREATE POLICY "admins create tournaments" ON public.tournaments
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "admins update tournaments" ON public.tournaments
  FOR UPDATE
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE TABLE public.transactions (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid,
  amount           integer                  NOT NULL,
  transaction_type text                     NOT NULL,
  description      text,
  created_at       timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.transactions TO anon;

GRANT ALL ON public.transactions TO authenticated;

GRANT ALL ON public.transactions TO service_role;

CREATE TABLE public.two_player_game_state (
  room_id       uuid                     NOT NULL,
  game_key      text                     NOT NULL,
  state         jsonb                    NOT NULL,
  current_seat  smallint                 DEFAULT 1 NOT NULL,
  version       integer                  DEFAULT 1 NOT NULL,
  status        text                     DEFAULT 'waiting'::text NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL,
  turn_deadline timestamp with time zone
);

ALTER TABLE public.two_player_game_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.two_player_game_state
  ADD CONSTRAINT two_player_game_state_current_seat_check CHECK (current_seat = ANY (ARRAY[1, 2]));

ALTER TABLE public.two_player_game_state
  ADD CONSTRAINT two_player_game_state_game_key_check CHECK (game_key = ANY (ARRAY['bingo'::text, 'four-in-a-row'::text, 'dominoes'::text]));

ALTER TABLE public.two_player_game_state
  ADD CONSTRAINT two_player_game_state_pkey PRIMARY KEY (room_id);

ALTER TABLE public.two_player_game_state
  ADD CONSTRAINT two_player_game_state_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.matchmaking_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.two_player_game_state
  ADD CONSTRAINT two_player_game_state_status_check CHECK (status = ANY (ARRAY['waiting'::text, 'playing'::text, 'completed'::text]));

GRANT ALL ON public.two_player_game_state TO anon;

GRANT ALL ON public.two_player_game_state TO authenticated;

GRANT ALL ON public.two_player_game_state TO service_role;

CREATE POLICY "two player room members read game state" ON public.two_player_game_state
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.matchmaking_room_players p
  WHERE ((p.room_id = two_player_game_state.room_id) AND (p.user_id = auth.uid()) AND (p.left_at IS NULL)))));

CREATE TABLE public.user_achievements (
  user_id        uuid                     NOT NULL,
  achievement_id uuid                     NOT NULL,
  unlocked_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_achievements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements_catalog(id) ON DELETE CASCADE;

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id);

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.user_achievements TO anon;

GRANT ALL ON public.user_achievements TO authenticated;

GRANT ALL ON public.user_achievements TO service_role;

CREATE TABLE public.user_badges (
  id        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id   uuid                     NOT NULL,
  badge_id  uuid                     NOT NULL,
  source    text                     NOT NULL,
  source_id uuid,
  earned_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_badges
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.rank_badges(id);

ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);

ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_user_id_badge_id_source_source_id_key UNIQUE (user_id, badge_id, source, source_id);

ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.user_badges TO anon;

GRANT ALL ON public.user_badges TO authenticated;

GRANT ALL ON public.user_badges TO service_role;

CREATE POLICY "admins manage badges" ON public.user_badges
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "users read badges" ON public.user_badges
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.user_inventory (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id     uuid,
  product_id  uuid,
  is_equipped boolean                  DEFAULT false,
  unlocked_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  cosmetic_id uuid,
  created_at  timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_inventory
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_inventory
  ADD CONSTRAINT fk_inventory_cosmetic FOREIGN KEY (cosmetic_id) REFERENCES public.store_items(id) ON DELETE CASCADE;

ALTER TABLE public.user_inventory
  ADD CONSTRAINT user_inventory_pkey PRIMARY KEY (id);

ALTER TABLE public.user_inventory
  ADD CONSTRAINT user_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;

ALTER TABLE public.user_inventory
  ADD CONSTRAINT user_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.user_inventory
  ADD CONSTRAINT user_inventory_user_id_product_id_key UNIQUE (user_id, product_id);

GRANT ALL ON public.user_inventory TO anon;

GRANT ALL ON public.user_inventory TO authenticated;

GRANT ALL ON public.user_inventory TO service_role;

CREATE POLICY "Allow users to insert into their own inventory" ON public.user_inventory
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Allow users to update their own equipped status" ON public.user_inventory
  FOR UPDATE
  USING ((auth.uid() = user_id));

CREATE POLICY "Allow users to view their own inventory" ON public.user_inventory
  FOR SELECT
  USING ((auth.uid() = user_id));

CREATE TABLE public.user_notifications (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     NOT NULL,
  title      text                     NOT NULL,
  message    text                     NOT NULL,
  kind       text                     DEFAULT 'system'::text NOT NULL,
  action_url text,
  is_read    boolean                  DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  category   text                     DEFAULT 'general'::text NOT NULL
);

ALTER TABLE public.user_notifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_category_check CHECK (category = ANY (ARRAY['general'::text, 'system'::text, 'promotion'::text]));

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.user_notifications TO anon;

GRANT ALL ON public.user_notifications TO authenticated;

GRANT ALL ON public.user_notifications TO service_role;

CREATE INDEX user_notifications_user_created_idx ON public.user_notifications (user_id, created_at DESC);

CREATE POLICY "admins manage notifications" ON public.user_notifications
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "users read their notifications" ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "users update their notifications" ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.wallet_activity_logs (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid                     NOT NULL,
  currency_type    text                     NOT NULL,
  amount           integer                  NOT NULL,
  balance_snapshot integer                  NOT NULL,
  activity_type    text                     DEFAULT 'profile_balance_change'::text NOT NULL,
  description      text                     DEFAULT 'Wallet balance updated'::text NOT NULL,
  metadata         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.wallet_activity_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_activity_logs
  ADD CONSTRAINT wallet_activity_logs_amount_check CHECK (amount <> 0);

ALTER TABLE public.wallet_activity_logs
  ADD CONSTRAINT wallet_activity_logs_currency_type_check CHECK (currency_type = ANY (ARRAY['points'::text, 'gems'::text]));

ALTER TABLE public.wallet_activity_logs
  ADD CONSTRAINT wallet_activity_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.wallet_activity_logs
  ADD CONSTRAINT wallet_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.wallet_activity_logs TO anon;

GRANT ALL ON public.wallet_activity_logs TO authenticated;

GRANT ALL ON public.wallet_activity_logs TO service_role;

CREATE INDEX wallet_activity_logs_user_created_idx ON public.wallet_activity_logs (user_id, created_at DESC);

CREATE TRIGGER wallet_activity_notification
  AFTER INSERT ON public.wallet_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_wallet_activity_notification();

CREATE POLICY "admins read wallet activity" ON public.wallet_activity_logs
  FOR SELECT
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "users read their wallet activity" ON public.wallet_activity_logs
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()));

CREATE TABLE public.wheel_rewards (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  label         text                     NOT NULL,
  reward_type   text                     NOT NULL,
  reward_value  integer                  NOT NULL,
  probability   numeric                  NOT NULL,
  display_order integer                  DEFAULT 0 NOT NULL,
  is_active     boolean                  DEFAULT true NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  wheel_color   text                     DEFAULT '#93df25'::text NOT NULL
);

ALTER TABLE public.wheel_rewards
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wheel_rewards
  ADD CONSTRAINT wheel_rewards_pkey PRIMARY KEY (id);

ALTER TABLE public.wheel_rewards
  ADD CONSTRAINT wheel_rewards_probability_check CHECK (probability > 0::numeric);

ALTER TABLE public.wheel_rewards
  ADD CONSTRAINT wheel_rewards_reward_type_check CHECK (reward_type = ANY (ARRAY['points'::text, 'gems'::text]));

ALTER TABLE public.wheel_rewards
  ADD CONSTRAINT wheel_rewards_reward_value_check CHECK (reward_value > 0);

ALTER TABLE public.wheel_rewards
  ADD CONSTRAINT wheel_rewards_wheel_color_check CHECK (wheel_color ~ '^#[0-9A-Fa-f]{6}$'::text);

GRANT ALL ON public.wheel_rewards TO anon;

GRANT ALL ON public.wheel_rewards TO authenticated;

GRANT ALL ON public.wheel_rewards TO service_role;

CREATE POLICY "admins manage wheel rewards" ON public.wheel_rewards
  TO authenticated
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])))
  WITH CHECK ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])));

CREATE POLICY "wheel rewards are readable" ON public.wheel_rewards
  FOR SELECT
  TO authenticated
  USING (true);

CREATE VIEW public.tournament_leaderboard AS SELECT tournament_id,
    user_id,
    score,
    matches_played,
    wins,
    draws,
    losses,
    dense_rank() OVER (PARTITION BY tournament_id ORDER BY score DESC, wins DESC, losses, matches_played DESC, joined_at) AS rank
   FROM public.tournament_entries e;

GRANT ALL ON public.tournament_leaderboard TO anon;

GRANT ALL ON public.tournament_leaderboard TO authenticated;

GRANT ALL ON public.tournament_leaderboard TO service_role;

CREATE MATERIALIZED VIEW public.global_leaderboard
  AS SELECT id AS user_id,
    username,
    avatar_url,
    points,
    rank() OVER (ORDER BY points DESC) AS global_rank
   FROM public.profiles
  WHERE (is_banned = false) WITH DATA;

CREATE UNIQUE INDEX global_leaderboard_idx ON public.global_leaderboard (user_id);

GRANT ALL ON public.global_leaderboard TO anon;

GRANT ALL ON public.global_leaderboard TO authenticated;

GRANT ALL ON public.global_leaderboard TO service_role;
