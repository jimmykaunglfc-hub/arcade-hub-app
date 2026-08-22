-- Shan Koe Mee is retained for staging builds, but must not be returned by the
-- production catalogue. This preserves the game record and all historical data.
update public.games
set status = 'hidden'
where lower(title) = 'shan koe mee'
  and status is distinct from 'hidden';
