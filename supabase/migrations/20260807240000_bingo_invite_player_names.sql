-- Backfill placeholder room names from existing player profiles. New chat
-- invitations now send these names directly from the client as well.
update public.matchmaking_room_players p
set display_name = pr.username
from public.profiles pr
where pr.id = p.user_id
  and coalesce(nullif(trim(pr.username), ''), '') <> ''
  and p.display_name in ('Player 1', 'Player 2', 'Online Player');
