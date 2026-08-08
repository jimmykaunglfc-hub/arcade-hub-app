-- Mini Fighter is a shipped native game, so it must appear in the same
-- admin-managed catalog as every other title. The update also repairs an
-- older, uncategorized self-healed catalog row without overwriting admin art.
insert into public.games (title, description, category, entry_fee, status, display_weight, catalog_label)
select 'Mini Fighter', 'Fast 1v1 arcade fighting with fighter specials, guard breaks, and rematches.', 'Arcade', 0, 'active', 100, 'new'
where not exists (
  select 1 from public.games where lower(title) = 'mini fighter'
);

update public.games
set
  category = 'Arcade',
  description = case when coalesce(description, '') = '' then 'Fast 1v1 arcade fighting with fighter specials, guard breaks, and rematches.' else description end,
  display_weight = greatest(coalesce(display_weight, 0), 100),
  catalog_label = coalesce(catalog_label, 'new')
where lower(title) = 'mini fighter';
