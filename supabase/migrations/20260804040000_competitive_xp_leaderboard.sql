-- XP is competitive progression. Points remain a spendable wallet currency.
alter table public.profiles add column if not exists xp bigint not null default 0 check (xp >= 0);

with earned as (
  select user_id, sum(case lower(coalesce(result, '')) when 'win' then 100 when 'victory' then 100 when 'draw' then 60 when 'loss' then 25 when 'defeat' then 25 else 0 end)::bigint as xp
  from public.match_history group by user_id
)
update public.profiles p set xp = earned.xp from earned where p.id = earned.user_id;

create or replace function public.award_match_xp()
returns trigger language plpgsql security definer set search_path = public as $$
declare amount integer;
begin
  amount := case lower(coalesce(new.result, '')) when 'win' then 100 when 'victory' then 100 when 'draw' then 60 when 'loss' then 25 when 'defeat' then 25 else 0 end;
  if amount > 0 then update public.profiles set xp = xp + amount where id = new.user_id; end if;
  return new;
end; $$;
drop trigger if exists match_history_xp_award on public.match_history;
create trigger match_history_xp_award after insert on public.match_history for each row execute function public.award_match_xp();

create index if not exists profiles_xp_leaderboard_idx on public.profiles (xp desc nulls last);
-- PostgreSQL cannot change a RETURNS TABLE signature in place. Dropping this
-- function removes only the old points-shaped RPC, not any leaderboard data.
drop function if exists public.get_global_leaderboard();
create or replace function public.get_global_leaderboard()
returns table (id uuid, username text, avatar_url text, xp bigint, gems bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, p.xp, p.gems from public.profiles p order by p.xp desc nulls last, p.created_at asc limit 50;
$$;
revoke all on function public.get_global_leaderboard() from public;
grant execute on function public.get_global_leaderboard() to authenticated;
