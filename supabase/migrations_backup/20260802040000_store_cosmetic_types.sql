-- Store assets need an explicit destination.  A generic "digital" category is
-- not enough to tell the player app whether an image is a game item, a card
-- background, or a transparent avatar ring.
alter table public.store_items
  add column if not exists cosmetic_type text not null default 'game_cosmetic';

alter table public.store_items
  drop constraint if exists store_items_cosmetic_type_check;

alter table public.store_items
  add constraint store_items_cosmetic_type_check
  check (cosmetic_type in ('game_cosmetic', 'profile_card', 'avatar_frame'));

comment on column public.store_items.cosmetic_type is
  'Digital cosmetic target: game_cosmetic (1:1), profile_card (16:9), or avatar_frame (1:1 transparent PNG/WebP with transparent centre).';

-- Existing digital products remain game cosmetics until an admin deliberately
-- classifies and, where needed, replaces their artwork in Store Management.
update public.store_items
set cosmetic_type = 'game_cosmetic'
where cosmetic_type is null or cosmetic_type not in ('game_cosmetic', 'profile_card', 'avatar_frame');
