-- Repair databases where bingo_match_cards was created before updated_at
-- was added to the Bingo card updates.
alter table public.bingo_match_cards
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows receive the default automatically; this makes the shared
-- draw, bot marking, and player marking RPCs work without resetting matches.
