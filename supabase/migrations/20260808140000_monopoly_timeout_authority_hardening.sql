-- Monopoly timeout must be safe when every connected client reaches the same
-- deadline at once. The row lock makes one caller advance the turn while all
-- other calls simply observe the refreshed deadline.
create or replace function public.advance_monopoly_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state jsonb;
  v_deadline timestamptz;
  v_active uuid;
  v_active_position integer;
  v_next uuid;
  v_version integer;
  v_next_deadline timestamptz;
begin
  select state, turn_deadline, active_player_id, version
    into v_state, v_deadline, v_active, v_version
  from public.monopoly_match_state
  where room_id=p_room_id and status='playing'
  for update;

  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'match_not_playing');
  end if;
  if v_deadline > now() then
    return jsonb_build_object('advanced', false, 'reason', 'deadline_not_reached');
  end if;

  select position into v_active_position
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where roster.player->>'id'=v_active::text
  limit 1;

  select (roster.player->>'id')::uuid into v_next
  from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
  where not coalesce((roster.player->>'bankrupt')::boolean, false)
  order by case when roster.position > coalesce(v_active_position, 0) then 0 else 1 end,
           roster.position
  limit 1;

  if v_next is null or v_next=v_active then
    return jsonb_build_object('advanced', false, 'reason', 'no_next_player');
  end if;

  -- Jail consumes exactly one turn, including a timeout while backgrounded.
  v_state := jsonb_set(
    v_state,
    '{players}',
    (
      select jsonb_agg(
        case when roster.player->>'id'=v_active::text
          then jsonb_set(jsonb_set(roster.player, '{inJail}', 'false'::jsonb), '{jailAttempts}', '0'::jsonb)
          else roster.player
        end
        order by roster.position
      )
      from jsonb_array_elements(v_state->'players') with ordinality roster(player, position)
    )
  );
  v_state := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(v_state, '{activePlayerId}', to_jsonb(v_next::text)),
              '{hasRolled}', 'false'::jsonb),
            '{pendingPurchaseId}', 'null'::jsonb),
          '{alert}', 'null'::jsonb),
        '{actionPanel}', 'null'::jsonb),
      '{autoPassPlayerId}', 'null'::jsonb),
    '{turnWarning}', 'false'::jsonb);
  v_state := jsonb_set(v_state, '{actionLog}', jsonb_build_object(
    'title', 'Turn timed out', 'highlight', 'NEXT PLAYER READY'
  ));

  update public.monopoly_match_state
  set state=v_state,
      active_player_id=v_next,
      version=v_version+1,
      turn_deadline=now()+interval '60 seconds',
      updated_at=now()
  where room_id=p_room_id
  returning turn_deadline into v_next_deadline;

  return jsonb_build_object(
    'advanced', true,
    'state', v_state,
    'active_player_id', v_next,
    'version', v_version+1,
    'turn_deadline', v_next_deadline
  );
end;
$$;

grant execute on function public.advance_monopoly_timeout(uuid) to authenticated;
