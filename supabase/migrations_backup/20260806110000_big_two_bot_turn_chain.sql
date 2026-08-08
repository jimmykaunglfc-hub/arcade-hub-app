-- Resolve consecutive bot seats in one server-owned operation.  Browser
-- polling remains a nudge only; it is no longer responsible for advancing
-- each bot one-at-a-time.
create or replace function public.resolve_big_two_bot_turns(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_current integer; v_status text; v_deadline timestamptz; v_is_bot boolean; v_steps integer := 0;
begin
  loop
    select current_seat,status,turn_deadline into v_current,v_status,v_deadline
    from public.big_two_match_state where room_id=p_room_id;
    exit when v_status is distinct from 'playing' or v_current is null or v_steps >= 4;
    select is_bot into v_is_bot from public.matchmaking_room_players where room_id=p_room_id and seat=v_current and left_at is null;
    -- A human remains in control until their deadline. If it expired, advance
    -- once and continue into any following bot seats.
    if not coalesce(v_is_bot,false) and v_deadline > now() then exit; end if;
    perform public.big_two_timeout_turn(p_room_id);
    v_steps := v_steps + 1;
  end loop;
  return jsonb_build_object('resolved_steps',v_steps);
end; $$;
grant execute on function public.resolve_big_two_bot_turns(uuid) to authenticated;
