insert into storage.buckets (id, name, public)
values ('splash-campaigns', 'splash-campaigns', true)
on conflict (id) do nothing;

drop policy if exists "public reads splash campaign images" on storage.objects;
create policy "public reads splash campaign images"
  on storage.objects for select
  to public
  using (bucket_id = 'splash-campaigns');

drop policy if exists "admins upload splash campaign images" on storage.objects;
create policy "admins upload splash campaign images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'splash-campaigns'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
  );

drop policy if exists "admins update splash campaign images" on storage.objects;
create policy "admins update splash campaign images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'splash-campaigns'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
  )
  with check (
    bucket_id = 'splash-campaigns'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
  );

drop policy if exists "admins delete splash campaign images" on storage.objects;
create policy "admins delete splash campaign images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'splash-campaigns'
    and (select role from public.profiles where id = auth.uid()) in ('admin', 'super_admin')
  );

