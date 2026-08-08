-- Jail skips are an authoritative turn transition. Previously the browser
-- optimistically advanced the turn using an unsupported state action, which
-- left the jailed player active in PostgreSQL and split clients apart.
create or replace function public.skip_monopoly_jail_turn(p_room_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_state jsonb; v_version integer; v_active uuid; v_next uuid; v_is_member boolean;
begin
  select state, version, active_player_id into v_state, v_version, v_active
  from public.monopoly_match_state where room_id = p_room_id and status = 'playing' for update;
  select exists(select 1 from public.matchmaking_room_players where room_id = p_room_id and user_id = auth.uid() and left_at is null) into v_is_member;
  if v_version is null or not v_is_member then raise exception 'Monopoly room is unavailable'; end if;
  if v_version <> p_expected_version then raise exception 'The board changed; please wait for sync'; end if;
  if v_active is distinct from auth.uid() and v_active::text not like '00000000-0000-4000-8000-%' then raise exception 'It is not the jailed player''s turn'; end if;
  if not exists(select 1 from jsonb_array_elements(v_state->'players') p where p->>'id' = v_active::text and coalesce((p->>'inJail')::boolean, false)) then
    raise exception 'The active Monopoly player is not in Jail';
  end if;
  select (p.player->>'id')::uuid into v_next
  from jsonb_array_elements(v_state->'players') with ordinality p(player, seat)
  where not coalesce((p.player->>'bankrupt')::boolean, false) and (p.player->>'id') <> v_active::text
  order by case when p.seat > (select q.seat from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text) then 0 else 1 end, p.seat
  limit 1;
  if v_next is null then raise exception 'No eligible Monopoly player remains'; end if;
  v_state := jsonb_set(v_state, array['players', (select (q.seat - 1)::text from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text)], jsonb_set(jsonb_set((select q.player from jsonb_array_elements(v_state->'players') with ordinality q(player, seat) where q.player->>'id' = v_active::text), '{inJail}', 'false'::jsonb), '{jailAttempts}', '0'::jsonb));
  v_state := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)), '{hasRolled}', 'false'::jsonb), '{autoPassPlayerId}', 'null'::jsonb), '{turnWarning}', 'false'::jsonb), '{actionLog}', jsonb_build_object('title', 'JAIL TURN SKIPPED', 'highlight', 'NEXT PLAYER READY'));
  update public.monopoly_match_state set state = v_state, active_player_id = v_next, version = version + 1, turn_deadline = now() + interval '60 seconds', updated_at = now() where room_id = p_room_id;
  insert into public.monopoly_match_events(room_id, state_version, actor_id, action, summary) values (p_room_id, v_version + 1, auth.uid(), 'jail_skip', 'Jail turn skipped');
  return jsonb_build_object('version', v_version + 1, 'next_player_id', v_next);
end;
$$;
grant execute on function public.skip_monopoly_jail_turn(uuid, integer) to authenticated;
