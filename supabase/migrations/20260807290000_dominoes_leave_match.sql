-- Allow a Dominoes player to leave an active room without the UI reopening it.
create or replace function public.leave_dominoes_match(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat smallint;
  v_other_seat smallint;
begin
  select seat into v_seat
  from public.matchmaking_room_players
  where room_id = p_room_id
    and user_id = auth.uid()
    and left_at is null;

  if v_seat is null then
    raise exception 'You are not a player in this match';
  end if;

  select seat into v_other_seat
  from public.matchmaking_room_players
  where room_id = p_room_id
    and seat <> v_seat
    and left_at is null
  limit 1;

  update public.matchmaking_room_players
  set left_at = now()
  where room_id = p_room_id
    and user_id = auth.uid()
    and left_at is null;

  update public.two_player_game_state
  set state = state || jsonb_build_object('winner_seat', v_other_seat, 'forfeit_seat', v_seat),
      status = 'completed',
      version = version + 1,
      updated_at = now()
  where room_id = p_room_id
    and game_key = 'dominoes'
    and status in ('waiting', 'playing');

  update public.matchmaking_rooms
  set status = case when v_other_seat is null then 'abandoned' else 'completed' end
  where id = p_room_id
    and status in ('waiting', 'playing');
end;
$$;

grant execute on function public.leave_dominoes_match(uuid) to authenticated;
