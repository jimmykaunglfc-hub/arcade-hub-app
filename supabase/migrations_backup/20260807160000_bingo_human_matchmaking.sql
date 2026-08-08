-- Authoritative two-player Bingo matchmaking, cards and shared caller.
create table if not exists public.bingo_match_cards (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  card jsonb not null,
  marked jsonb not null default '[12]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, seat)
);
alter table public.bingo_match_cards enable row level security;
drop policy if exists "bingo room members read cards" on public.bingo_match_cards;
create policy "bingo room members read cards" on public.bingo_match_cards for select to authenticated using (
  exists (select 1 from public.matchmaking_room_players p where p.room_id=bingo_match_cards.room_id and p.user_id=auth.uid() and p.left_at is null)
);

create or replace function public.bingo_new_card()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_columns jsonb[] := array[]::jsonb[]; v_card jsonb := '[]'::jsonb; v_col integer; v_row integer; v_values jsonb;
begin
  for v_col in 0..4 loop
    select coalesce(jsonb_agg(number), '[]'::jsonb) into v_values
    from (
      select number from generate_series(v_col * 15 + 1, v_col * 15 + 15) number order by random() limit 5
    ) picks;
    v_columns := array_append(v_columns, v_values);
  end loop;
  for v_row in 0..4 loop
    for v_col in 0..4 loop
      if v_row=2 and v_col=2 then v_card := v_card || jsonb_build_array(null);
      else v_card := v_card || jsonb_build_array(v_columns[v_col+1] -> v_row);
      end if;
    end loop;
  end loop;
  return v_card;
end $$;

create or replace function public.bingo_line_count(p_marked jsonb)
returns integer language plpgsql immutable set search_path=public as $$
declare v_total integer := 0;
begin
  if p_marked @> '[0,1,2,3,4]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[5,6,7,8,9]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[10,11,12,13,14]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[15,16,17,18,19]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[20,21,22,23,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[0,5,10,15,20]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[1,6,11,16,21]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[2,7,12,17,22]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[3,8,13,18,23]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[4,9,14,19,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[0,6,12,18,24]'::jsonb then v_total:=v_total+1; end if;
  if p_marked @> '[4,8,12,16,20]'::jsonb then v_total:=v_total+1; end if;
  return v_total;
end $$;

create or replace function public.initialize_bingo_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_players integer; v_seat integer;
begin
  if not exists (select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then
    raise exception 'Not a Bingo player';
  end if;
  if exists (
    select 1
    from public.two_player_game_state s
    where s.room_id=p_room_id
      and s.game_key='bingo'
      and s.status in ('playing','completed')
      and (select count(*) from public.bingo_match_cards c where c.room_id=p_room_id) = 2
  ) then
    return jsonb_build_object('room_id',p_room_id,'started',true);
  end if;
  select count(*) into v_players from public.matchmaking_room_players where room_id=p_room_id and left_at is null;
  if v_players<>2 then raise exception 'Bingo needs two players'; end if;
  delete from public.bingo_match_cards where room_id=p_room_id;
  for v_seat in 1..2 loop
    insert into public.bingo_match_cards(room_id,seat,card,marked) values(p_room_id,v_seat,public.bingo_new_card(),'[12]'::jsonb);
  end loop;
  update public.two_player_game_state set state=jsonb_build_object('called_numbers','[]'::jsonb,'winner_seat',null),current_seat=1,version=version+1,status='playing',updated_at=now() where room_id=p_room_id and game_key='bingo';
  update public.matchmaking_rooms set status='playing' where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'started',true);
end $$;
grant execute on function public.initialize_bingo_match(uuid) to authenticated;

create or replace function public.queue_bingo_match(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_seat smallint; v_opponent text; v_bot boolean; v_code text;
begin
  select r.* into v_room from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id=r.id
  where r.game_key='bingo' and r.max_players=2 and r.status in ('waiting','playing') and p.user_id=auth.uid() and p.left_at is null
  order by r.created_at desc limit 1;
  if v_room.id is not null then
    select seat into v_seat from public.matchmaking_room_players where room_id=v_room.id and user_id=auth.uid() and left_at is null;
    select display_name,is_bot into v_opponent,v_bot from public.matchmaking_room_players where room_id=v_room.id and seat<>v_seat and left_at is null limit 1;
    return jsonb_build_object('room_id',v_room.id,'seat',v_seat,'matched',v_room.status='playing','opponent_name',v_opponent,'is_bot',coalesce(v_bot,false));
  end if;
  select r.* into v_room from public.matchmaking_rooms r
  where r.game_key='bingo' and r.max_players=2 and r.status='waiting'
    and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.left_at is null and not p.is_bot and p.user_id is distinct from auth.uid())
  order by r.created_at limit 1 for update skip locked;
  if v_room.id is not null then
    insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),2,coalesce(nullif(p_name,''),'Online Player'),true);
    perform public.initialize_bingo_match(v_room.id);
    select display_name into v_opponent from public.matchmaking_room_players where room_id=v_room.id and seat=1;
    return jsonb_build_object('room_id',v_room.id,'seat',2,'matched',true,'opponent_name',v_opponent,'is_bot',false);
  end if;
  v_code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  insert into public.matchmaking_rooms(game_key,room_code,max_players,host_id,fill_bots,expires_at) values('bingo',v_code,2,auth.uid(),true,now()+interval '24 hours') returning * into v_room;
  insert into public.matchmaking_room_players(room_id,user_id,seat,display_name,ready) values(v_room.id,auth.uid(),1,coalesce(nullif(p_name,''),'Online Player'),true);
  insert into public.two_player_game_state(room_id,game_key,state,status) values(v_room.id,'bingo','{}'::jsonb,'waiting');
  return jsonb_build_object('room_id',v_room.id,'seat',1,'matched',false);
end $$;
grant execute on function public.queue_bingo_match(text) to authenticated;

create or replace function public.fill_bingo_match_with_bot(p_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room public.matchmaking_rooms; v_name text;
begin
  select r.* into v_room from public.matchmaking_rooms r join public.matchmaking_room_players p on p.room_id=r.id
  where r.game_key='bingo' and r.max_players=2 and r.status='waiting' and p.user_id=auth.uid() and p.left_at is null
  order by r.created_at desc limit 1 for update;
  if v_room.id is null then raise exception 'No waiting Bingo match found'; end if;
  v_name := (array['Alex Morgan','Sam Rivera','Jordan Lee','Taylor Quinn'])[1+floor(random()*4)::integer];
  insert into public.matchmaking_room_players(room_id,seat,display_name,is_bot,ready) values(v_room.id,2,v_name,true,true);
  perform public.initialize_bingo_match(v_room.id);
  return jsonb_build_object('room_id',v_room.id,'seat',1,'opponent_name',v_name);
end $$;
grant execute on function public.fill_bingo_match_with_bot(text) to authenticated;

create or replace function public.cancel_bingo_matchmaking()
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.matchmaking_rooms r set status='cancelled'
  where r.game_key='bingo' and r.status='waiting' and exists(select 1 from public.matchmaking_room_players p where p.room_id=r.id and p.user_id=auth.uid() and p.left_at is null);
end $$;
grant execute on function public.cancel_bingo_matchmaking() to authenticated;

create or replace function public.bingo_draw_number(p_room_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_called jsonb; v_draw integer; v_bot record; v_card jsonb; v_marked jsonb; v_index integer; v_winner integer := null; v_seat smallint;
begin
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  if v_state.status<>'playing' or v_state.version<>p_expected_version then raise exception 'Bingo board changed; reload'; end if;
  if not exists(select 1 from public.matchmaking_room_players p where p.room_id=p_room_id and p.user_id=auth.uid() and p.left_at is null) then raise exception 'Not a Bingo player'; end if;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_seat <> 1 then raise exception 'Only the room host calls Bingo balls'; end if;
  v_called:=coalesce(v_state.state->'called_numbers','[]'::jsonb);
  select number into v_draw from generate_series(1,75) number where not (v_called @> jsonb_build_array(number)) order by random() limit 1;
  if v_draw is null then raise exception 'All Bingo balls were called'; end if;
  v_called:=v_called || jsonb_build_array(v_draw);
  for v_bot in select seat from public.matchmaking_room_players where room_id=p_room_id and is_bot and left_at is null loop
    select card,marked into v_card,v_marked from public.bingo_match_cards where room_id=p_room_id and seat=v_bot.seat for update;
    for v_index in 0..24 loop
      if (v_card->>v_index)=v_draw::text and not (v_marked @> jsonb_build_array(v_index)) then v_marked:=v_marked || jsonb_build_array(v_index); end if;
    end loop;
    update public.bingo_match_cards set marked=v_marked,updated_at=now() where room_id=p_room_id and seat=v_bot.seat;
    if public.bingo_line_count(v_marked)>=5 then v_winner:=v_bot.seat; end if;
  end loop;
  update public.two_player_game_state set state=jsonb_set(jsonb_set(v_state.state,'{called_numbers}',v_called),'{winner_seat}',to_jsonb(v_winner)),version=version+1,status=case when v_winner is null then 'playing' else 'completed' end,updated_at=now() where room_id=p_room_id;
  if v_winner is not null then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('number',v_draw,'version',v_state.version+1,'winner_seat',v_winner);
end $$;
grant execute on function public.bingo_draw_number(uuid,integer) to authenticated;

create or replace function public.bingo_mark_square(p_room_id uuid,p_tile_index integer,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.two_player_game_state; v_seat smallint; v_card jsonb; v_marked jsonb; v_number text; v_winner integer := null;
begin
  if p_tile_index not between 0 and 24 then raise exception 'Invalid Bingo square'; end if;
  select * into v_state from public.two_player_game_state where room_id=p_room_id and game_key='bingo' for update;
  select seat into v_seat from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
  if v_state.status<>'playing' or v_state.version<>p_expected_version or v_seat is null then raise exception 'Bingo board changed; reload'; end if;
  select card,marked into v_card,v_marked from public.bingo_match_cards where room_id=p_room_id and seat=v_seat for update;
  v_number:=v_card->>p_tile_index;
  if p_tile_index<>12 and not (coalesce(v_state.state->'called_numbers','[]'::jsonb) @> jsonb_build_array((v_number)::integer)) then raise exception 'That number has not been called'; end if;
  -- A called square is permanent.  This avoids accidental unmarks and keeps
  -- the server's line calculation consistent for both clients.
  if not (v_marked @> jsonb_build_array(p_tile_index)) then v_marked:=v_marked || jsonb_build_array(p_tile_index); end if;
  if public.bingo_line_count(v_marked)>=5 then v_winner:=v_seat; end if;
  update public.bingo_match_cards set marked=v_marked,updated_at=now() where room_id=p_room_id and seat=v_seat;
  update public.two_player_game_state set state=jsonb_set(v_state.state,'{winner_seat}',to_jsonb(v_winner)),version=version+1,status=case when v_winner is null then 'playing' else 'completed' end,updated_at=now() where room_id=p_room_id;
  if v_winner is not null then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
  return jsonb_build_object('version',v_state.version+1,'winner_seat',v_winner);
end $$;
grant execute on function public.bingo_mark_square(uuid,integer,integer) to authenticated;
