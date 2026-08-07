-- Dominoes corrective release.
--
-- The first room-matchmaking migration has already been applied in production.
-- Keep production corrections in a new migration so Supabase actually executes
-- them on deploy.

-- A played tile may be visually reversed.  The exposed ends must therefore be
-- calculated from its displayed orientation, not the raw left/right values.
create or replace function public.dominoes_tile_playable(p_tile jsonb, p_board jsonb)
returns boolean
language sql
immutable
as $$
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
$$;

-- Resolve precisely one bot turn.  A bot draws once when necessary and, if the
-- drawn tile is usable, plays it immediately; otherwise it passes to the human.
-- This makes every server transition complete without relying on a browser tab.
create or replace function public.resolve_dominoes_bot_turn(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.dominoes_tile_playable(jsonb, jsonb) to authenticated;
grant execute on function public.resolve_dominoes_bot_turn(uuid) to authenticated;
