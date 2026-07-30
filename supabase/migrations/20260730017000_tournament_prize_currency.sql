-- Optional scheduling and currency metadata for the existing production schema.
alter table public.tournaments add column if not exists start_date timestamptz;
alter table public.tournaments add column if not exists prize_currency text not null default 'points' check (prize_currency in ('points', 'gems'));

notify pgrst, 'reload schema';
