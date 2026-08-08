-- Player-owned ratings and admin-owned catalog presentation settings.
alter table public.games
  add column if not exists display_weight integer not null default 0,
  add column if not exists catalog_label text,
  add constraint games_catalog_label_check check (catalog_label is null or catalog_label in ('hot', 'new', 'popular', 'featured'));

create table if not exists public.game_ratings (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index if not exists game_ratings_game_idx on public.game_ratings (game_id);

alter table public.game_ratings enable row level security;
create policy "game ratings are readable" on public.game_ratings for select to authenticated using (true);
create policy "users create their game ratings" on public.game_ratings for insert to authenticated with check (user_id = auth.uid());
create policy "users update their game ratings" on public.game_ratings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_game_catalog()
returns table (
  id uuid, title text, description text, category text, entry_fee numeric,
  image_url text, status text, display_weight integer, catalog_label text,
  average_rating numeric, rating_count bigint, my_rating smallint
)
language sql stable security invoker set search_path = public
as $$
  select g.id, g.title, g.description, g.category, g.entry_fee, g.image_url,
    g.status, g.display_weight, g.catalog_label,
    coalesce(round(avg(r.rating)::numeric, 1), 0) as average_rating,
    count(r.rating) as rating_count,
    max(r.rating) filter (where r.user_id = auth.uid())::smallint as my_rating
  from public.games g
  left join public.game_ratings r on r.game_id = g.id
  group by g.id
  order by g.display_weight desc, g.created_at desc;
$$;
grant execute on function public.get_game_catalog() to anon, authenticated;
