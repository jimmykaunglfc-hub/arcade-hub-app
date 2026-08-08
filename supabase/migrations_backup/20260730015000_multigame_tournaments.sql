alter table public.tournaments add column if not exists games text[] not null default '{}';
update public.tournaments set games = array[game] where cardinality(games) = 0 and game is not null;
alter table public.tournament_entries add column if not exists game_results jsonb not null default '{}'::jsonb;
