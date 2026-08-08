-- Keep Big Two turn progression visible. The first bot action (including the
-- required 3-diamond opener) is scheduled after the game screen loads, rather
-- than being consumed immediately by a page-load RPC.
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
  v_steps integer := 0;
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

  -- Never advance a real player before their 30-second deadline.
  if not coalesce(v_is_bot, false) then
    if v_deadline > now() then
      return jsonb_build_object('resolved_steps', 0);
    end if;

    perform public.big_two_timeout_turn(p_room_id);
    return jsonb_build_object('resolved_steps', 1, 'timed_out_human', true);
  end if;

  -- A bot must visibly hold its turn before it acts. This prevents the opener
  -- and following bot turns from being completed before the player sees them.
  if v_deadline is null or v_deadline > now() then
    update public.big_two_match_state
    set turn_deadline = least(
          coalesce(turn_deadline, now() + interval '3 seconds'),
          now() + interval '3 seconds'
        ),
        updated_at = now()
    where room_id = p_room_id
      and current_seat = v_current
      and status = 'playing';

    return jsonb_build_object('resolved_steps', 0, 'bot_thinking', true);
  end if;

  -- Exactly one bot plays or passes per call.
  perform public.big_two_timeout_turn(p_room_id);
  v_steps := 1;

  return jsonb_build_object('resolved_steps', v_steps);
end;
$$;

grant execute on function public.resolve_big_two_bot_turns(uuid) to authenticated;
