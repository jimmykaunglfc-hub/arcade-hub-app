-- A cosmetic must declare both what it is and which game may consume it.
-- This prevents legacy artwork (for example a Carrom board) being applied by
-- another game through a broad category match.
alter table public.cosmetics add column if not exists cosmetic_type text not null default 'game_cosmetic';
alter table public.cosmetics add column if not exists game_target text;
alter table public.cosmetics drop constraint if exists cosmetics_cosmetic_type_check;
alter table public.cosmetics add constraint cosmetics_cosmetic_type_check check (cosmetic_type in ('game_cosmetic', 'profile_card', 'avatar_frame'));

update public.cosmetics
set game_target = lower(regexp_replace(coalesce(game_category, ''), '[^a-z0-9]+', '_', 'g'))
where cosmetic_type = 'game_cosmetic' and nullif(game_target, '') is null
  and lower(coalesce(game_category, '')) in ('carrom','checkers','chess','uno','snooker','pool','tictactoe','glitch_deck','nexus_breach','liars_dice','neural_duel','biometric_override');

comment on column public.cosmetics.game_target is 'Exact native game key; unscoped legacy game cosmetics are ignored until an admin assigns a target.';
