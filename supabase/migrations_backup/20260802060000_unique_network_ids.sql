alter table public.profiles add column if not exists network_id text;

create or replace function public.assign_profile_network_id()
returns trigger language plpgsql as $$
begin
  if new.network_id is null or btrim(new.network_id) = '' then
    new.network_id := lower(regexp_replace(coalesce(new.username, 'player'), '[^a-zA-Z0-9_]+', '', 'g')) || '-' || substr(new.id::text, 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_network_id on public.profiles;
create trigger profiles_assign_network_id
before insert on public.profiles
for each row execute function public.assign_profile_network_id();

update public.profiles
set network_id = lower(regexp_replace(coalesce(username, 'player'), '[^a-zA-Z0-9_]+', '', 'g')) || '-' || substr(id::text, 1, 6)
where network_id is null or btrim(network_id) = '';

alter table public.profiles alter column network_id set not null;
create unique index if not exists profiles_network_id_unique on public.profiles (lower(network_id));

comment on column public.profiles.network_id is 'Permanent, case-insensitive unique player identifier generated from the account name.';
