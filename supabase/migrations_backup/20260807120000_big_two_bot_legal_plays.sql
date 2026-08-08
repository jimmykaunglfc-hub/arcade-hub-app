-- Make Big Two bots play valid simple hands instead of passing every time a
-- table card exists. Five-card hands may still be passed strategically; the
-- bot plays singles, pairs and triples only when it can legally beat them.
create or replace function public.big_two_timeout_turn(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.big_two_timeout_turn(uuid) to authenticated;
