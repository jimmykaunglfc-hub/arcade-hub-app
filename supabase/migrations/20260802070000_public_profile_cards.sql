create or replace function public.get_public_profile_card(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  card_background_url text,
  avatar_frame_url text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    (
      select si.image_url from user_inventory ui
      join store_items si on si.id = ui.cosmetic_id
      where ui.user_id = p.id and ui.is_equipped = true and si.cosmetic_type = 'profile_card'
      limit 1
    ),
    (
      select si.image_url from user_inventory ui
      join store_items si on si.id = ui.cosmetic_id
      where ui.user_id = p.id and ui.is_equipped = true and si.cosmetic_type = 'avatar_frame'
      limit 1
    )
  from profiles p where p.id = target_user_id;
$$;

revoke all on function public.get_public_profile_card(uuid) from public;
grant execute on function public.get_public_profile_card(uuid) to authenticated;
