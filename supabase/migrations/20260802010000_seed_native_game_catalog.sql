-- Register shipped native games in the admin-managed catalog. Existing admin
-- configuration is preserved; the client catalog also self-heals a deletion.
insert into public.games (title, description, category, entry_fee, status)
select seed.title, seed.description, 'Uncategorized', 0, 'active'
from (
  values
    ('Cup Pong', 'Arcade cup-toss challenge.'),
    ('Four in a Row', 'Classic four-in-a-row strategy match.'),
    ('Bingo', 'Fast-paced bingo card challenge.'),
    ('Ping Pong', 'Table tennis arena match.')
) as seed(title, description)
where not exists (
  select 1 from public.games existing
  where lower(existing.title) = lower(seed.title)
);
