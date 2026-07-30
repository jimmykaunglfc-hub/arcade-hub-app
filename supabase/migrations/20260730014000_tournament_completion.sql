create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, badge_id uuid not null references public.rank_badges(id), source text not null, source_id uuid, earned_at timestamptz not null default now(), unique(user_id, badge_id, source, source_id)
);

alter table public.tournament_awards enable row level security;
create policy "awards are readable" on public.tournament_awards for select to authenticated using (true);
create policy "admins manage awards" on public.tournament_awards for all to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin')) with check ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));
alter table public.user_badges enable row level security;
create policy "users read badges" on public.user_badges for select to authenticated using (user_id=auth.uid());
create policy "admins manage badges" on public.user_badges for all to authenticated using ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin')) with check ((select role from public.profiles where id=auth.uid()) in ('admin','super_admin'));

create or replace function public.complete_tournament(target_tournament uuid)
returns void language plpgsql security definer set search_path=public as $$
declare event public.tournaments; entrant public.tournament_entries; award public.tournament_awards;
begin
  if (select role from public.profiles where id=auth.uid()) not in ('admin','super_admin') then raise exception 'Admin access required'; end if;
  select * into event from public.tournaments where id=target_tournament for update;
  if not found or event.status='completed' then raise exception 'Tournament cannot be completed'; end if;
  for entrant in select * from public.tournament_entries where tournament_id=target_tournament loop
    select * into award from public.tournament_awards where tournament_id=target_tournament and placement=entrant.placement;
    perform set_config('app.wallet_activity_type','tournament_reward',true);
    perform set_config('app.wallet_activity_description','Tournament reward: ' || event.title,true);
    if coalesce(award.points,0) + coalesce(event.participation_points,0) > 0 then update public.profiles set points=coalesce(points,0)+coalesce(award.points,0)+coalesce(event.participation_points,0) where id=entrant.user_id; end if;
    if coalesce(award.gems,0) + coalesce(event.participation_gems,0) > 0 then update public.profiles set gems=coalesce(gems,0)+coalesce(award.gems,0)+coalesce(event.participation_gems,0) where id=entrant.user_id; end if;
    if event.participation_badge_id is not null then insert into public.user_badges(user_id,badge_id,source,source_id) values(entrant.user_id,event.participation_badge_id,'tournament_participation',target_tournament) on conflict do nothing; end if;
    if award.badge_id is not null then insert into public.user_badges(user_id,badge_id,source,source_id) values(entrant.user_id,award.badge_id,'tournament_placement',target_tournament) on conflict do nothing; end if;
    update public.tournament_entries set status=case when entrant.placement=1 then 'winner' else 'participated' end, completed_at=now() where id=entrant.id;
  end loop;
  update public.tournaments set status='completed' where id=target_tournament;
end; $$;
grant execute on function public.complete_tournament(uuid) to authenticated;
