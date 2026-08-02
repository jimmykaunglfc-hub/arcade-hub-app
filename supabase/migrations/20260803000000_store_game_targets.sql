-- Game cosmetics are exclusive per target game, while profile cards and avatar
-- borders remain exclusive by their existing cosmetic_type.
alter table public.store_items
  add column if not exists game_target text;

alter table public.store_items
  drop constraint if exists store_items_game_target_format_check;

alter table public.store_items
  add constraint store_items_game_target_format_check
  check (game_target is null or game_target ~ '^[a-z0-9_]{2,64}$');

comment on column public.store_items.game_target is
  'Target game key for a game_cosmetic. Only one equipped cosmetic is allowed per target game.';
