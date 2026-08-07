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

-- Deal a fresh double-six set once both seats have joined. The highest double
-- in either hand is stored as the mandatory opening tile.
create or replace function public.initialize_dominoes_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tiles jsonb; h1 jsonb; h2 jsonb; pile jsonb; opener jsonb; opener_seat smallint;
begin
  if not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then raise exception 'Not a room player'; end if;
  if (select count(*) from public.matchmaking_room_players where room_id=p_room_id and left_at is null) <> 2 then raise exception 'Dominoes needs two players'; end if;
  if exists(select 1 from public.dominoes_match_hands where room_id=p_room_id) then return jsonb_build_object('initialized',true); end if;
  select jsonb_agg(tile order by random()) into tiles from (
    select jsonb_build_object('id',a::text||'-'||b::text,'left',a,'right',b) tile
    from generate_series(0,6) a cross join lateral generate_series(a,6) b
  ) x;
  select jsonb_agg(value) into h1 from jsonb_array_elements(tiles) with ordinality x(value,n) where n<=7;
  select jsonb_agg(value) into h2 from jsonb_array_elements(tiles) with ordinality x(value,n) where n between 8 and 14;
  select jsonb_agg(value) into pile from jsonb_array_elements(tiles) with ordinality x(value,n) where n>14;
  select value into opener from jsonb_array_elements(h1) value where (value->>'left')=(value->>'right') order by (value->>'left')::int desc limit 1;
  opener_seat:=1;
  if opener is null or coalesce((opener->>'left')::int,-1) < coalesce((select (value->>'left')::int from jsonb_array_elements(h2) value where value->>'left'=value->>'right' order by (value->>'left')::int desc limit 1),-1) then
    select value into opener from jsonb_array_elements(h2) value where value->>'left'=value->>'right' order by (value->>'left')::int desc limit 1; opener_seat:=2;
  end if;
  insert into public.dominoes_match_hands(room_id,seat,hand) values(p_room_id,1,coalesce(h1,'[]')), (p_room_id,2,coalesce(h2,'[]'));
  update public.two_player_game_state set state=jsonb_build_object('board','[]'::jsonb,'draw_pile',coalesce(pile,'[]'),'opening_tile_id',opener->>'id','winner_seat',null,'blocked',false,'passes',0),current_seat=opener_seat,status='playing',version=version+1,updated_at=now() where room_id=p_room_id and game_key='dominoes';
  return jsonb_build_object('initialized',true,'opening_seat',opener_seat);
end $$;
grant execute on function public.initialize_dominoes_match(uuid) to authenticated;

-- Read-only helper used by both play and draw/pass validation.
create or replace function public.dominoes_tile_playable(p_tile jsonb, p_board jsonb)
returns boolean language sql immutable as $$
  select case when jsonb_array_length(coalesce(p_board,'[]'::jsonb))=0 then true else
    (p_tile->>'left')::int in (((p_board->0->>'left')::int),((p_board->-1->>'right')::int))
    or (p_tile->>'right')::int in (((p_board->0->>'left')::int),((p_board->-1->>'right')::int)) end
$$;

create or replace function public.dominoes_draw_or_pass(p_room_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.two_player_game_state; seat_no smallint; v_hand jsonb; pile jsonb; tile jsonb; passes int; p1 int; p2 int; winner_no smallint;
begin
 select * into s from public.two_player_game_state where room_id=p_room_id and game_key='dominoes' for update;
 select seat into seat_no from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 if s.room_id is null or seat_no is null or s.status<>'playing' or s.current_seat<>seat_no then raise exception 'Not your turn'; end if;
 if s.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
 select d.hand into v_hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=seat_no;
 if exists(select 1 from jsonb_array_elements(v_hand) t where public.dominoes_tile_playable(t,s.state->'board')) then raise exception 'You have a playable domino'; end if;
 pile:=coalesce(s.state->'draw_pile','[]'::jsonb);
 if jsonb_array_length(pile)>0 then
   tile:=pile->0;
   update public.dominoes_match_hands d set hand=v_hand||jsonb_build_array(tile) where d.room_id=p_room_id and d.seat=seat_no;
   update public.two_player_game_state set state=jsonb_set(s.state,'{draw_pile}',pile-0),version=version+1,updated_at=now() where room_id=p_room_id;
   return jsonb_build_object('drew',true);
 end if;
 passes:=coalesce((s.state->>'passes')::int,0)+1;
 if passes>=2 then
   select coalesce(sum((value->>'left')::int+(value->>'right')::int),0) into p1 from jsonb_array_elements((select d.hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=1));
   select coalesce(sum((value->>'left')::int+(value->>'right')::int),0) into p2 from jsonb_array_elements((select d.hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=2));
   winner_no:=case when p1<p2 then 1 when p2<p1 then 2 else null end;
   update public.two_player_game_state set state=jsonb_set(jsonb_set(s.state,'{passes}',to_jsonb(passes)),'{winner_seat}',to_jsonb(winner_no)),status='completed',version=version+1,updated_at=now() where room_id=p_room_id;
   update public.matchmaking_rooms set status='completed' where id=p_room_id;
   return jsonb_build_object('blocked',true,'winner_seat',winner_no);
 end if;
 update public.two_player_game_state set state=jsonb_set(s.state,'{passes}',to_jsonb(passes)),current_seat=case when seat_no=1 then 2 else 1 end,version=version+1,updated_at=now() where room_id=p_room_id;
 return jsonb_build_object('passed',true);
end $$;
grant execute on function public.dominoes_draw_or_pass(uuid,integer) to authenticated;

create or replace function public.dominoes_play(p_room_id uuid,p_tile_id text,p_side text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.two_player_game_state; seat_no smallint; v_hand jsonb; tile jsonb; board jsonb; left_end int; right_end int; a int; b int; reversed boolean:=false; played jsonb; next_hand jsonb; won boolean;
begin
 select * into s from public.two_player_game_state where room_id=p_room_id and game_key='dominoes' for update;
 select seat into seat_no from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null;
 if s.room_id is null or seat_no is null or s.status<>'playing' or s.current_seat<>seat_no then raise exception 'Not your turn'; end if;
 if s.version<>p_expected_version then raise exception 'Game changed; reload state'; end if;
 select d.hand into v_hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=seat_no;
 select value into tile from jsonb_array_elements(v_hand) value where value->>'id'=p_tile_id;
 if tile is null then raise exception 'Tile not in your hand'; end if;
 board:=coalesce(s.state->'board','[]'::jsonb); a:=(tile->>'left')::int; b:=(tile->>'right')::int;
 if jsonb_array_length(board)=0 then
   if p_tile_id is distinct from s.state->>'opening_tile_id' then raise exception 'Play the opening double first'; end if;
   played:=tile||jsonb_build_object('reversed',false,'playedSide','start'); board:=jsonb_build_array(played);
 else
   left_end:=case when coalesce((board->0->>'reversed')::boolean,false) then (board->0->>'right')::int else (board->0->>'left')::int end;
   right_end:=case when coalesce((board->-1->>'reversed')::boolean,false) then (board->-1->>'left')::int else (board->-1->>'right')::int end;
   if p_side='left' then
     if b=left_end then reversed:=false; elsif a=left_end then reversed:=true; else raise exception 'Tile does not match the left end'; end if;
   elsif p_side='right' then
     if a=right_end then reversed:=false; elsif b=right_end then reversed:=true; else raise exception 'Tile does not match the right end'; end if;
   else raise exception 'Choose left or right'; end if;
   played:=tile||jsonb_build_object('reversed',reversed,'playedSide',p_side);
   board:=case when p_side='left' then jsonb_build_array(played)||board else board||jsonb_build_array(played) end;
 end if;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into next_hand from jsonb_array_elements(v_hand) value where value->>'id'<>p_tile_id;
 won:=jsonb_array_length(next_hand)=0;
 update public.dominoes_match_hands set hand=next_hand where room_id=p_room_id and seat=seat_no;
 update public.two_player_game_state set state=jsonb_set(jsonb_set(jsonb_set(s.state,'{board}',board),'{passes}','0'::jsonb),'{winner_seat}',case when won then to_jsonb(seat_no) else 'null'::jsonb end),current_seat=case when won then seat_no else case when seat_no=1 then 2 else 1 end end,status=case when won then 'completed' else 'playing' end,version=version+1,updated_at=now() where room_id=p_room_id;
 if won then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
 return jsonb_build_object('played',true,'winner_seat',case when won then seat_no else null end);
end $$;
grant execute on function public.dominoes_play(uuid,text,text,integer) to authenticated;

-- Bot moves are executed server-side; it picks the highest-value legal tile,
-- otherwise draws once or passes through the same authoritative state.
create or replace function public.resolve_dominoes_bot_turn(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.two_player_game_state; bot_seat smallint; v_hand jsonb; tile jsonb; board jsonb; a int; b int; right_end int; reversed boolean:=false; played jsonb; next_hand jsonb; pile jsonb; won boolean;
begin
 select * into s from public.two_player_game_state where room_id=p_room_id and game_key='dominoes' for update;
 if s.room_id is null or s.status<>'playing' then return jsonb_build_object('acted',false); end if;
 select seat into bot_seat from public.matchmaking_room_players where room_id=p_room_id and seat=s.current_seat and is_bot and left_at is null;
 if bot_seat is null then return jsonb_build_object('acted',false); end if;
 select d.hand into v_hand from public.dominoes_match_hands d where d.room_id=p_room_id and d.seat=bot_seat;
 board:=coalesce(s.state->'board','[]'::jsonb);
 select value into tile from jsonb_array_elements(v_hand) value where public.dominoes_tile_playable(value,board) order by ((value->>'left')::int+(value->>'right')::int) desc limit 1;
 if tile is null then
   pile:=coalesce(s.state->'draw_pile','[]'::jsonb);
   if jsonb_array_length(pile)>0 then
     update public.dominoes_match_hands d set hand=v_hand||jsonb_build_array(pile->0) where d.room_id=p_room_id and d.seat=bot_seat;
     update public.two_player_game_state set state=jsonb_set(s.state,'{draw_pile}',pile-0),version=version+1,updated_at=now() where room_id=p_room_id;
     return jsonb_build_object('drew',true);
   end if;
   update public.two_player_game_state set current_seat=case when bot_seat=1 then 2 else 1 end,version=version+1,updated_at=now() where room_id=p_room_id;
   return jsonb_build_object('passed',true);
 end if;
 a:=(tile->>'left')::int; b:=(tile->>'right')::int;
 if jsonb_array_length(board)=0 then played:=tile||jsonb_build_object('reversed',false,'playedSide','start'); board:=jsonb_build_array(played);
 else
   right_end:=case when coalesce((board->-1->>'reversed')::boolean,false) then (board->-1->>'left')::int else (board->-1->>'right')::int end;
   reversed:=b=right_end and a<>right_end;
   played:=tile||jsonb_build_object('reversed',reversed,'playedSide','right'); board:=board||jsonb_build_array(played);
 end if;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into next_hand from jsonb_array_elements(v_hand) value where value->>'id'<>tile->>'id'; won:=jsonb_array_length(next_hand)=0;
 update public.dominoes_match_hands set hand=next_hand where room_id=p_room_id and seat=bot_seat;
 update public.two_player_game_state set state=jsonb_set(jsonb_set(s.state,'{board}',board),'{winner_seat}',case when won then to_jsonb(bot_seat) else 'null'::jsonb end),current_seat=case when won then bot_seat else case when bot_seat=1 then 2 else 1 end end,status=case when won then 'completed' else 'playing' end,version=version+1,updated_at=now() where room_id=p_room_id;
 if won then update public.matchmaking_rooms set status='completed' where id=p_room_id; end if;
 return jsonb_build_object('acted',true);
end $$;
grant execute on function public.resolve_dominoes_bot_turn(uuid) to authenticated;
