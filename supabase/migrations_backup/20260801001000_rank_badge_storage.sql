insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rank-badges',
  'rank-badges',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

drop policy if exists "public reads rank badges" on storage.objects;
create policy "public reads rank badges" on storage.objects
  for select using (bucket_id = 'rank-badges');

drop policy if exists "admins upload rank badges" on storage.objects;
create policy "admins upload rank badges" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rank-badges' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

drop policy if exists "admins update rank badges" on storage.objects;
create policy "admins update rank badges" on storage.objects
  for update to authenticated
  using (bucket_id = 'rank-badges' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'))
  with check (bucket_id = 'rank-badges' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));

drop policy if exists "admins delete rank badges" on storage.objects;
create policy "admins delete rank badges" on storage.objects
  for delete to authenticated
  using (bucket_id = 'rank-badges' and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin'));
