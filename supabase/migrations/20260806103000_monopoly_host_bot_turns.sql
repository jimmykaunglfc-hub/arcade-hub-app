-- The client needs the authoritative host id to drive deterministic bot turns.
-- The earlier room read model omitted it, which left `isRoomHost` false on
-- every device and prevented Monopoly bots from ever rolling.
create or replace function public.get_matchmaking_room(p_room_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'game_key', r.game_key, 'room_code', r.room_code,
    'max_players', r.max_players, 'host_id', r.host_id, 'status', r.status,
    'fill_bots', r.fill_bots, 'expires_at', r.expires_at,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'seat', p.seat, 'user_id', p.user_id, 'name', p.display_name,
      'avatar_url', p.avatar_url, 'is_bot', p.is_bot, 'ready', p.ready
    ) order by p.seat) from public.matchmaking_room_players p where p.room_id = r.id and p.left_at is null), '[]'::jsonb)
  )
  from public.matchmaking_rooms r where r.id = p_room_id;
$$;
grant execute on function public.get_matchmaking_room(uuid) to authenticated;
