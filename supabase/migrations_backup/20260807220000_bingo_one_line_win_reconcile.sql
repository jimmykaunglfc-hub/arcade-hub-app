-- Standard Bingo: one completed row, column, or diagonal wins the match.
-- Run after the Bingo draw/mark repair migration.

-- Older installed draw/mark RPCs used `bingo_line_count(...) >= 5`.  Returning
-- the legacy win threshold once *any* line is complete keeps those already
-- installed functions correct without requiring a reset of live rooms.
create or replace function public.bingo_line_count(p_marked jsonb)
returns integer language plpgsql immutable set search_path=public as $$
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
end $$;

create or replace function public.reconcile_bingo_winners()
returns integer language plpgsql security definer set search_path=public as $$
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
end $$;

grant execute on function public.reconcile_bingo_winners() to authenticated;
select public.reconcile_bingo_winners();
