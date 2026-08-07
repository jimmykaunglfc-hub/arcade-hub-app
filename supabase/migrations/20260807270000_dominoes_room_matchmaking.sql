-- Dominoes room-backed matchmaking. The game state itself is initialized by
-- initialize_dominoes_match once both seats are present.

create table if not exists public.dominoes_match_hands (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  hand jsonb not null default '[]'::jsonb,
  primary key (room_id, seat)
);
alter table public.dominoes_match_hands enable row level security;
drop policy if exists "dominoes players read own hand" on public.dominoes_match_hands;
create policy "dominoes players read own hand" on public.dominoes_match_hands for select to authenticated using (
  exists(select 1 from public.matchmaking_room_players p where p.room_id=dominoes_match_hands.room_id and p.seat=dominoes_match_hands.seat and p.user_id=auth.uid() and p.left_at is null)
);

create or replace function public.queue_dominoes_match(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.matchmaking_rooms; s smallint; n text; b boolean; code text;
begin
  select mr.* into r from public.matchmaking_rooms mr join public.matchmaking_room_players p on p.room_id=mr.id
  where mr.game_key='dominoes' and mr.status in ('waiting','playing') and p.user_id=auth.uid() and p.left_at is null and mr.created_at>=now()-interval '55 seconds' order by mr.created_at desc limit 1;
  if r.id is not null then
    select seat into s from public.matchmaking_room_players where room_id=r.id and user_id=auth.uid() and left_at is null;
    select display_name,is_bot into n,b from public.matchmaking_room_players where room_id=r.id and seat<>s and left_at is null limit 1;
    return jsonb_build_object('room_id',r.id,'seat',s,'matched',r.status='playing','opponent_name',n,'is_bot',coalesce(b,false));
  end if;
  select * into r from public.matchmaking_rooms mr where mr.game_key='dominoes' and mr.status='waiting' and mr.max_players=2 and mr.created_at>=now()-interval '45 seconds' and exists(select 1 from public.matchmaking_room_players p where p.room_id=mr.id and p.user_id is distinct from auth.uid() and not p.is_bot and p.left_at is null) order by mr.created_at limit 1 for update skip locked;
  if r.id is not null then
    insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(r.id,auth.uid(),2,coalesce(nullif(p_name,''),'Online Player'),true);
    update public.matchmaking_rooms set status='playing' where id=r.id;
    update public.two_player_game_state set status='playing',current_seat=1,updated_at=now() where room_id=r.id and game_key='dominoes';
    select display_name into n from public.matchmaking_room_players where room_id=r.id and seat=1;
    return jsonb_build_object('room_id',r.id,'seat',2,'matched',true,'opponent_name',n,'is_bot',false);
  end if;
  code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at) values('dominoes',code,2,auth.uid(),true,now()+interval '24 hours') returning * into r;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(r.id,auth.uid(),1,coalesce(nullif(p_name,''),'Online Player'),true);
  insert into public.two_player_game_state(room_id,game_key,state,status) values(r.id,'dominoes','{}'::jsonb,'waiting');
  return jsonb_build_object('room_id',r.id,'seat',1,'matched',false);
end $$;

create or replace function public.fill_dominoes_match_with_bot(p_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.matchmaking_rooms; n text;
begin
  select mr.* into r from public.matchmaking_rooms mr join public.matchmaking_room_players p on p.room_id=mr.id where mr.game_key='dominoes' and mr.status='waiting' and mr.created_at<=now()-interval '45 seconds' and p.user_id=auth.uid() and p.left_at is null order by mr.created_at desc limit 1 for update;
  if r.id is null then raise exception 'The 45-second player search is still active'; end if;
  n:=(array['ShadowBlade_99','LunaTick','BlazeRunner','NovaStrike'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(r.id,2,n,true,true);
  update public.matchmaking_rooms set status='playing' where id=r.id;
  update public.two_player_game_state set status='playing',current_seat=1,updated_at=now() where room_id=r.id and game_key='dominoes';
  return jsonb_build_object('room_id',r.id,'seat',1,'opponent_name',n);
end $$;

create or replace function public.cancel_dominoes_matchmaking()
returns void language plpgsql security definer set search_path=public as $$ begin
  update public.matchmaking_rooms r set status='cancelled' where r.game_key='dominoes' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null);
end $$;

grant execute on function public.queue_dominoes_match(text) to authenticated;
grant execute on function public.fill_dominoes_match_with_bot(text) to authenticated;
grant execute on function public.cancel_dominoes_matchmaking() to authenticated;
