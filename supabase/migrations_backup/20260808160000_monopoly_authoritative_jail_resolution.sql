-- Resolve jail at the beginning of the jailed player's next turn. This is
-- deliberately independent of a client-side expected version: a stale mobile
-- client must never be able to leave a jailed player holding the table.
create or replace function public.resolve_monopoly_jail_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state jsonb;
  v_active uuid;
  v_version integer;
  v_active_position integer;
  v_next uuid;
  v_cards integer;
  v_used_pass boolean := false;
  v_deadline timestamptz;
begin
  if not exists (
    select 1 from public.matchmaking_room_players
    where room_id=p_room_id and user_id=auth.uid() and left_at is null
  ) then
    raise exception 'Not a Monopoly room member';
  end if;

  select state, active_player_id, version
    into v_state, v_active, v_version
  from public.monopoly_match_state
  where room_id=p_room_id and status='playing'
  for update;
  if not found then return jsonb_build_object('resolved', false); end if;

  -- A player who has just landed in Jail finishes the landing turn normally.
  -- The forced resolution occurs only when their next playable turn begins.
  if coalesce((v_state->>'hasRolled')::boolean, false) then
    return jsonb_build_object('resolved', false);
  end if;

  select roster.position, coalesce((roster.player->>'jailFreeCards')::integer, 0)
    into v_active_position, v_cards
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where roster.player->>'id'=v_active::text
    and coalesce((roster.player->>'inJail')::boolean, false)
  limit 1;
  if v_active_position is null then return jsonb_build_object('resolved', false); end if;

  if v_cards > 0 then
    v_used_pass := true;
    v_next := v_active;
    v_state := jsonb_set(
      v_state,
      array['players', (v_active_position - 1)::text],
      jsonb_set(
        jsonb_set(v_state->'players'->(v_active_position - 1), '{inJail}', 'false'::jsonb),
        '{jailFreeCards}', to_jsonb(v_cards - 1)
      )
    );
  else
    select (roster.player->>'id')::uuid into v_next
    from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
    where not coalesce((roster.player->>'bankrupt')::boolean, false)
      and roster.player->>'id'<>v_active::text
    order by case when roster.position > v_active_position then 0 else 1 end,
             roster.position
    limit 1;
    if v_next is null then return jsonb_build_object('resolved', false); end if;
    v_state := jsonb_set(
      v_state,
      array['players', (v_active_position - 1)::text],
      jsonb_set(
        jsonb_set(v_state->'players'->(v_active_position - 1), '{inJail}', 'false'::jsonb),
        '{jailAttempts}', '0'::jsonb
      )
    );
  end if;

  v_state := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)),
        '{hasRolled}', 'false'::jsonb),
      '{autoPassPlayerId}', 'null'::jsonb),
    '{turnWarning}', 'false'::jsonb);
  v_state := jsonb_set(v_state, '{actionLog}', jsonb_build_object(
    'title', case when v_used_pass then 'JAIL PASS USED' else 'JAIL TURN SKIPPED' end,
    'highlight', case when v_used_pass then 'ESCAPED JAIL · CAN ROLL' else 'NEXT PLAYER READY' end
  ));

  update public.monopoly_match_state
  set state=v_state,
      active_player_id=v_next,
      version=v_version+1,
      turn_deadline=now()+interval '60 seconds',
      updated_at=now()
  where room_id=p_room_id
  returning turn_deadline into v_deadline;

  return jsonb_build_object(
    'resolved', true,
    'used_jail_pass', v_used_pass,
    'state', v_state,
    'active_player_id', v_next,
    'version', v_version+1,
    'turn_deadline', v_deadline
  );
end;
$$;

grant execute on function public.resolve_monopoly_jail_turn(uuid) to authenticated;
