alter table public.profiles add column if not exists language text not null default 'en' check (language in ('en','my','th','zh','km','lo','fr','de','es'));
create or replace function public.update_profile_language(new_language text) returns void language plpgsql security definer set search_path=public as $$ begin if new_language not in ('en','my','th','zh','km','lo','fr','de','es') then raise exception 'Unsupported language'; end if; update public.profiles set language = new_language where id = auth.uid(); end; $$;
grant execute on function public.update_profile_language(text) to authenticated;
notify pgrst, 'reload schema';
