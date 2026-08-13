-- Configurable lifetime free allowance followed by a server-enforced group
-- creation charge. The ledger prevents deleting an old group to reset access.
alter table public.platform_config
  add column if not exists group_creation_free_limit integer not null default 1,
  add column if not exists group_creation_cost integer not null default 100,
  add column if not exists group_creation_currency text not null default 'points';

alter table public.platform_config
  drop constraint if exists platform_config_group_creation_free_limit_check,
  add constraint platform_config_group_creation_free_limit_check check (group_creation_free_limit >= 0),
  drop constraint if exists platform_config_group_creation_cost_check,
  add constraint platform_config_group_creation_cost_check check (group_creation_cost >= 0),
  drop constraint if exists platform_config_group_creation_currency_check,
  add constraint platform_config_group_creation_currency_check check (group_creation_currency in ('points', 'gems'));

create table if not exists public.chat_group_creation_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.chat_groups(id) on delete set null,
  charged_amount integer not null default 0 check (charged_amount >= 0),
  charged_currency text check (charged_currency in ('points', 'gems')),
  created_at timestamptz not null default now()
);

create index if not exists chat_group_creation_ledger_user_idx
  on public.chat_group_creation_ledger (user_id, created_at);

alter table public.chat_group_creation_ledger enable row level security;
drop policy if exists "users view their group creation history" on public.chat_group_creation_ledger;
create policy "users view their group creation history"
  on public.chat_group_creation_ledger for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users create groups" on public.chat_groups;

create or replace function public.get_my_group_creation_policy()
returns table(
  free_limit integer,
  creations_used integer,
  free_creations_remaining integer,
  paid_cost integer,
  paid_currency text
)
language sql
security definer
set search_path = public
as $$
  with config as (
    select group_creation_free_limit, group_creation_cost, group_creation_currency
    from public.platform_config where id = 1
  ), usage as (
    select count(*)::integer as creations_used
    from public.chat_group_creation_ledger where user_id = auth.uid()
  )
  select
    config.group_creation_free_limit,
    usage.creations_used,
    greatest(config.group_creation_free_limit - usage.creations_used, 0)::integer,
    config.group_creation_cost,
    config.group_creation_currency
  from config cross join usage;
$$;

create or replace function public.create_chat_group(
  p_name text,
  p_description text default ''
)
returns table(
  group_id uuid,
  charged_amount integer,
  charged_currency text,
  free_creations_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.platform_config;
  creator public.profiles;
  created_group public.chat_groups;
  creations_used integer;
  charge integer := 0;
  currency text := null;
  clean_name text := btrim(coalesce(p_name, ''));
  clean_description text := btrim(coalesce(p_description, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to create a group'; end if;
  if char_length(clean_name) < 3 or char_length(clean_name) > 60 then
    raise exception 'Group names must be between 3 and 60 characters';
  end if;
  if char_length(clean_description) > 500 then
    raise exception 'Group descriptions must be 500 characters or fewer';
  end if;

  -- Locking the creator row makes the allowance and charge safe if a user
  -- submits two create requests at the same time.
  select * into creator from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into settings from public.platform_config where id = 1;
  if not found then raise exception 'Group creation settings are unavailable'; end if;
  select count(*)::integer into creations_used
  from public.chat_group_creation_ledger where user_id = auth.uid();

  if creations_used >= settings.group_creation_free_limit then
    charge := settings.group_creation_cost;
    currency := settings.group_creation_currency;
    if currency = 'gems' and coalesce(creator.gems, 0) < charge then
      raise exception 'Not enough gems to create another group';
    end if;
    if currency = 'points' and coalesce(creator.points, 0) < charge then
      raise exception 'Not enough points to create another group';
    end if;
    if charge > 0 then
      if currency = 'gems' then
        update public.profiles set gems = gems - charge where id = auth.uid();
      else
        update public.profiles set points = points - charge where id = auth.uid();
      end if;
    end if;
  end if;

  insert into public.chat_groups(name, description, created_by)
  values(clean_name, clean_description, auth.uid())
  returning * into created_group;
  insert into public.chat_group_members(group_id, user_id, role)
  values(created_group.id, auth.uid(), 'owner');
  insert into public.chat_group_creation_ledger(user_id, group_id, charged_amount, charged_currency)
  values(auth.uid(), created_group.id, charge, currency);

  return query select
    created_group.id,
    charge,
    currency,
    greatest(settings.group_creation_free_limit - creations_used - 1, 0)::integer;
end;
$$;

revoke all on function public.get_my_group_creation_policy() from public;
revoke all on function public.create_chat_group(text, text) from public;
grant execute on function public.get_my_group_creation_policy() to authenticated;
grant execute on function public.create_chat_group(text, text) to authenticated;
notify pgrst, 'reload schema';
