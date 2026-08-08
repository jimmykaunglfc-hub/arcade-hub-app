-- Monopoly settlement is based on the finalized board circulation, not the
-- original stake pot. `circulationBalance` begins at all four entry balances
-- (entry fee × 10) and increases by $200 on every passed GO.
create or replace function public.settle_completed_monopoly_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;

-- Keep the round choice and circulation ledger within the published game-state
-- contract. The browser may select only the approved checkpoints.
create or replace function public.validate_monopoly_state_economy(p_state jsonb)
returns boolean language sql immutable as $$
  select coalesce((p_state->>'roundLimit')::integer, 100) in (30, 50, 100)
    and coalesce((p_state->>'roundsLeft')::integer, -1) between 0 and coalesce((p_state->>'roundLimit')::integer, 100)
    and coalesce((p_state->>'circulationBalance')::bigint, 0) >= 0;
$$;
