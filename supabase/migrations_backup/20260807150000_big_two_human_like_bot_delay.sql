-- Restore the normal 30-second Big Two clock for every player. Bots wait a
-- short, visible think period within that clock before their server action.
drop trigger if exists big_two_bot_turn_deadline on public.big_two_match_state;
drop function if exists public.set_big_two_bot_turn_deadline();

create or replace function public.resolve_big_two_bot_turns(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.resolve_big_two_bot_turns(uuid) to authenticated;

-- Dealing must not consume a bot's opening 3-diamond card before a player has
-- entered the board. The resolver above starts that turn after the think time.
create or replace function public.big_two_deal_room(
  p_room_id uuid,
  p_turn_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;
