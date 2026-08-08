-- Profile cards have fixed mobile-safe geometry.  Their background artwork is
-- therefore 5:4, not 16:9.  The optional layout tells the player where the
-- background artwork reserves the avatar slot.
alter table public.store_items
  add column if not exists profile_card_layout text not null default 'centered';

alter table public.store_items
  drop constraint if exists store_items_profile_card_layout_check;

alter table public.store_items
  add constraint store_items_profile_card_layout_check
  check (profile_card_layout in ('centered', 'avatar_left'));

comment on column public.store_items.profile_card_layout is
  'Profile-card artwork layout. avatar_left reserves the avatar centre at 27% horizontal / 50% vertical; centered uses the standard card composition.';
