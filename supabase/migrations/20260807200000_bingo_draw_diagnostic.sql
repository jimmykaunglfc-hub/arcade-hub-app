-- Temporary, safe diagnostic. It does not change any Bingo data.
-- Run this in Supabase SQL Editor and copy the one returned JSON result.

create or replace function public.diagnose_bingo_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
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
end $$;

grant execute on function public.diagnose_bingo_room(uuid) to authenticated;

-- Inspect the most recently updated active Bingo room. This does not alter it.
select public.diagnose_bingo_room((select room_id from public.two_player_game_state where game_key='bingo' and status='playing' order by updated_at desc limit 1));
