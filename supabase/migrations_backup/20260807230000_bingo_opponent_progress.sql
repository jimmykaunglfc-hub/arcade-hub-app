-- Keep Bingo cards private while allowing each player to see the opponent's
-- mark pattern (never their card numbers).
drop policy if exists "bingo room members read cards" on public.bingo_match_cards;
drop policy if exists "bingo players read own card" on public.bingo_match_cards;
create policy "bingo players read own card" on public.bingo_match_cards
for select to authenticated using (
  exists (
    select 1 from public.matchmaking_room_players p
    where p.room_id=bingo_match_cards.room_id
      and p.user_id=auth.uid()
      and p.seat=bingo_match_cards.seat
      and p.left_at is null
  )
);

create or replace function public.get_bingo_opponent_progress(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_seat smallint; v_opponent record;
begin
  select seat into v_seat from public.matchmaking_room_players
  where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_seat is null then raise exception 'Not a Bingo player'; end if;
  select p.display_name,p.is_bot,c.marked into v_opponent
  from public.matchmaking_room_players p
  join public.bingo_match_cards c on c.room_id=p.room_id and c.seat=p.seat
  where p.room_id=p_room_id and p.seat<>v_seat and p.left_at is null
  limit 1;
  if v_opponent.display_name is null then return '{}'::jsonb; end if;
  return jsonb_build_object('name',v_opponent.display_name,'is_bot',v_opponent.is_bot,'marked',v_opponent.marked);
end $$;
grant execute on function public.get_bingo_opponent_progress(uuid) to authenticated;
