-- Shared, human-only two-player rooms used by Bingo, Four in a Row and Dominoes.
create table if not exists public.two_player_game_state (
  room_id uuid primary key references public.matchmaking_rooms(id) on delete cascade,
  game_key text not null check (game_key in ('bingo','four-in-a-row','dominoes')),
  state jsonb not null,
  current_seat smallint not null default 1 check (current_seat in (1,2)),
  version integer not null default 1,
  status text not null default 'waiting' check (status in ('waiting','playing','completed')),
  updated_at timestamptz not null default now()
);
alter table public.two_player_game_state enable row level security;
drop policy if exists "two player room members read game state" on public.two_player_game_state;
create policy "two player room members read game state" on public.two_player_game_state for select to authenticated using (
  exists(select 1 from public.matchmaking_room_players p where p.room_id=two_player_game_state.room_id and p.user_id=auth.uid() and p.left_at is null)
);

create or replace function public.create_two_player_room(p_game_key text, p_name text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room uuid; v_code text;
begin
  if lower(p_game_key) not in ('bingo','four-in-a-row','dominoes') then raise exception 'Unsupported two-player game'; end if;
  v_code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at)
  values(lower(p_game_key),v_code,2,auth.uid(),false,now()+interval '24 hours') returning id into v_room;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room,auth.uid(),1,coalesce(nullif(p_name,''),'Player 1'),true);
  insert into public.two_player_game_state(room_id,game_key,state) values(v_room,lower(p_game_key),p_state);
  return jsonb_build_object('room_id',v_room,'room_code',v_code,'seat',1);
end $$;
grant execute on function public.create_two_player_room(text,text,jsonb) to authenticated;

create or replace function public.join_two_player_room(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_players integer;
begin
  select * into v_room from public.matchmaking_rooms where room_code=upper(trim(p_code)) and max_players=2 and status='waiting' for update;
  if v_room.id is null then raise exception 'Room not found or already started'; end if;
  select count(*) into v_players from public.matchmaking_room_players where room_id=v_room.id and left_at is null;
  if v_players<>1 then raise exception 'Room is full'; end if;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),2,coalesce(nullif(p_name,''),'Player 2'),true);
  update public.matchmaking_rooms set status='playing' where id=v_room.id;
  update public.two_player_game_state set status='playing',updated_at=now() where room_id=v_room.id;
  return jsonb_build_object('room_id',v_room.id,'game_key',v_room.game_key,'seat',2);
end $$;
grant execute on function public.join_two_player_room(text,text) to authenticated;

create or replace function public.update_two_player_game_state(p_room_id uuid,p_state jsonb,p_current_seat smallint,p_expected_version integer,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id for update;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.id is null or v_seat is null then raise exception 'Not a room player'; end if;
  if v_state.status<>'playing' then raise exception 'Game is not active'; end if;
  if v_state.current_seat<>v_seat then raise exception 'Not your turn'; end if;
  if v_state.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
  update public.two_player_game_state set state=p_state,current_seat=p_current_seat,version=version+1,status=case when p_completed then 'completed' else 'playing' end,updated_at=now() where room_id=p_room_id;
  return jsonb_build_object('version',v_state.version+1);
end $$;
grant execute on function public.update_two_player_game_state(uuid,jsonb,smallint,integer,boolean) to authenticated;
