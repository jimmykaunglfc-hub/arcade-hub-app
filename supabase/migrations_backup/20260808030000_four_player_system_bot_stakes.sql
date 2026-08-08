-- Bot seats are system-funded entrants. Their contributions are recorded at
-- the instant a paid four-player table starts, so a human winner receives the
-- same full pot whether opponents are people or Joe Yoke bots.

create table if not exists public.four_player_bot_escrow (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  seat smallint not null check (seat between 1 and 4),
  entry_points integer not null check (entry_points >= 0),
  status text not null default 'held' check (status in ('held', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (room_id, seat)
);

create table if not exists public.monopoly_match_bot_escrow (
  room_id uuid not null references public.matchmaking_rooms(id) on delete cascade,
  seat smallint not null check (seat between 1 and 4),
  entry_points bigint not null check (entry_points >= 0),
  match_currency bigint not null check (match_currency >= 0),
  status text not null default 'held' check (status in ('held', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (room_id, seat)
);

alter table public.four_player_bot_escrow enable row level security;
alter table public.monopoly_match_bot_escrow enable row level security;

create or replace function public.four_player_entry_fee(p_game_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce((
    select entry_fee::integer
    from public.games
    where lower(title) = case lower(p_game_key)
      when 'big-two' then 'big two'
      else lower(p_game_key)
    end
    limit 1
  ), 0), 0);
$$;

create or replace function public.fund_system_four_player_bot_entries(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_entry_fee integer;
  v_seat smallint;
  v_inserted integer := 0;
begin
  select game_key into v_game_key from public.matchmaking_rooms where id = p_room_id;
  if v_game_key not in ('big-two', 'ludo') then
    return jsonb_build_object('funded_bots', 0);
  end if;
  v_entry_fee := public.four_player_entry_fee(v_game_key);
  for v_seat in
    select seat from public.matchmaking_room_players
    where room_id = p_room_id and left_at is null and is_bot
  loop
    insert into public.four_player_bot_escrow(room_id, seat, entry_points)
    values (p_room_id, v_seat, v_entry_fee)
    on conflict (room_id, seat) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return jsonb_build_object('funded_bots', v_inserted, 'entry_points_each', v_entry_fee);
end;
$$;

create or replace function public.fund_system_monopoly_bot_entries(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_entry_fee bigint;
  v_seat smallint;
  v_inserted integer := 0;
begin
  select game_key into v_game_key from public.matchmaking_rooms where id = p_room_id;
  if v_game_key <> 'monopoly' then return jsonb_build_object('funded_bots', 0); end if;
  v_entry_fee := public.four_player_entry_fee(v_game_key);
  for v_seat in
    select seat from public.matchmaking_room_players
    where room_id = p_room_id and left_at is null and is_bot
  loop
    insert into public.monopoly_match_bot_escrow(room_id, seat, entry_points, match_currency)
    values (p_room_id, v_seat, v_entry_fee, v_entry_fee * 10)
    on conflict (room_id, seat) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return jsonb_build_object('funded_bots', v_inserted, 'entry_points_each', v_entry_fee);
end;
$$;

-- Final gate before a lobby becomes playable. It prevents any legacy client
-- path from skipping a human's entry payment and creates the system-funded bot
-- entries exactly once.
create or replace function public.guard_four_player_paid_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unfunded integer := 0;
  v_total integer;
begin
  if old.status = 'waiting' and new.status = 'starting'
    and new.max_players = 4 and new.game_key in ('monopoly', 'big-two', 'ludo') then
    select count(*) into v_total from public.matchmaking_room_players
    where room_id = new.id and left_at is null;
    if v_total <> 4 then raise exception 'Four players are required before starting'; end if;

    if new.game_key = 'monopoly' then
      select count(*) into v_unfunded
      from public.matchmaking_room_players p
      where p.room_id = new.id and p.left_at is null and not p.is_bot
        and not exists (
          select 1 from public.monopoly_match_escrow e
          where e.room_id = new.id and e.user_id = p.user_id and e.status = 'held'
        );
      if v_unfunded > 0 then raise exception 'Every human player must fund the match before it starts'; end if;
      perform public.fund_system_monopoly_bot_entries(new.id);
    else
      select count(*) into v_unfunded
      from public.matchmaking_room_players p
      where p.room_id = new.id and p.left_at is null and not p.is_bot
        and not exists (
          select 1 from public.four_player_match_escrow e
          where e.room_id = new.id and e.user_id = p.user_id and e.status = 'held'
        );
      if v_unfunded > 0 then raise exception 'Every human player must fund the match before it starts'; end if;
      perform public.fund_system_four_player_bot_entries(new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_four_player_paid_start on public.matchmaking_rooms;
create trigger guard_four_player_paid_start
before update of status on public.matchmaking_rooms
for each row execute function public.guard_four_player_paid_start();

create or replace function public.settle_four_player_room(
  p_room_id uuid,
  p_winner_seat smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_key text;
  v_winner_id uuid;
  v_winner_is_bot boolean;
  v_total integer;
  v_duration integer;
begin
  select game_key, greatest(0, extract(epoch from now() - created_at)::integer)
  into v_game_key, v_duration
  from public.matchmaking_rooms where id = p_room_id for update;
  if v_game_key not in ('big-two', 'ludo') then raise exception 'This is not a supported four-player room'; end if;

  select user_id, is_bot into v_winner_id, v_winner_is_bot
  from public.matchmaking_room_players
  where room_id = p_room_id and seat = p_winner_seat and left_at is null;
  if not found then raise exception 'Winning seat is not in this room'; end if;

  select coalesce((select sum(entry_points) from public.four_player_match_escrow where room_id = p_room_id and status = 'held'), 0)
       + coalesce((select sum(entry_points) from public.four_player_bot_escrow where room_id = p_room_id and status = 'held'), 0)
  into v_total;

  if not coalesce(v_winner_is_bot, false) and v_winner_id is not null then
    update public.profiles set points = coalesce(points, 0) + v_total where id = v_winner_id;
  end if;
  update public.four_player_match_escrow set status = 'settled', settled_at = now()
  where room_id = p_room_id and status = 'held';
  update public.four_player_bot_escrow set status = 'settled', settled_at = now()
  where room_id = p_room_id and status = 'held';

  insert into public.match_history(user_id, game_title, opponent_name, result, points_change, duration_seconds)
  select e.user_id,
         case v_game_key when 'big-two' then 'Big Two' else 'Ludo' end,
         'Four-player arena',
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then 'win' else 'loss' end,
         case when e.user_id = v_winner_id and not coalesce(v_winner_is_bot, false) then v_total else 0 end,
         v_duration
  from public.four_player_match_escrow e where e.room_id = p_room_id;

  update public.matchmaking_rooms set status = 'completed' where id = p_room_id;
  return jsonb_build_object('settled', true, 'winner_seat', p_winner_seat,
    'payout', case when coalesce(v_winner_is_bot, false) then 0 else v_total end,
    'bot_won', coalesce(v_winner_is_bot, false));
end;
$$;

create or replace function public.settle_monopoly_room(p_room_id uuid, p_winner_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_reward bigint; v_host uuid; v_winner_is_bot boolean;
begin
  select host_id into v_host from public.matchmaking_rooms where id = p_room_id for update;
  if v_host is distinct from auth.uid() then raise exception 'Only the room host can settle Monopoly'; end if;
  select is_bot into v_winner_is_bot from public.matchmaking_room_players where room_id = p_room_id and user_id = p_winner_id and left_at is null;
  if not found then raise exception 'Winner is not in this room'; end if;
  select coalesce((select sum(match_currency) from public.monopoly_match_escrow where room_id=p_room_id and status='held'),0)
       + coalesce((select sum(match_currency) from public.monopoly_match_bot_escrow where room_id=p_room_id and status='held'),0)
  into v_total;
  v_reward := floor(v_total * 0.10);
  if not coalesce(v_winner_is_bot, false) then update public.profiles set points=points+v_reward where id=p_winner_id; end if;
  update public.monopoly_match_escrow set status='settled' where room_id=p_room_id and status='held';
  update public.monopoly_match_bot_escrow set status='settled', settled_at=now() where room_id=p_room_id and status='held';
  update public.matchmaking_rooms set status='completed' where id=p_room_id;
  return jsonb_build_object('total_match_currency',v_total,'winner_points',case when coalesce(v_winner_is_bot,false) then 0 else v_reward end);
end; $$;

create or replace function public.settle_completed_monopoly_match(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_state jsonb; v_winner uuid; v_total bigint; v_reward bigint; v_winner_is_bot boolean;
begin
  select state into v_state from public.monopoly_match_state where room_id=p_room_id and status='completed' for update;
  if v_state is null or not exists(select 1 from public.matchmaking_room_players where room_id=p_room_id and user_id=auth.uid() and left_at is null) then raise exception 'Only an active Monopoly player can settle this match'; end if;
  v_winner := (v_state->>'winnerId')::uuid;
  if v_winner is null then raise exception 'No Monopoly winner was recorded'; end if;
  select is_bot into v_winner_is_bot from public.matchmaking_room_players where room_id=p_room_id and user_id=v_winner and left_at is null;
  if not found then
    -- Monopoly bot IDs are server-owned pseudo-users, so detect them from the
    -- serialized board when no authenticated roster user exists.
    v_winner_is_bot := true;
  end if;
  select coalesce((select sum(match_currency) from public.monopoly_match_escrow where room_id=p_room_id and status='held'),0)
       + coalesce((select sum(match_currency) from public.monopoly_match_bot_escrow where room_id=p_room_id and status='held'),0)
  into v_total;
  v_reward := floor(v_total * .10);
  if not coalesce(v_winner_is_bot,false) then update public.profiles set points=points+v_reward where id=v_winner; end if;
  update public.monopoly_match_escrow set status='settled' where room_id=p_room_id and status='held';
  update public.monopoly_match_bot_escrow set status='settled', settled_at=now() where room_id=p_room_id and status='held';
  update public.matchmaking_rooms set status='completed' where id=p_room_id;
  insert into public.match_history(user_id,game_title,opponent_name,result,points_change,duration_seconds)
  select e.user_id,'Monopoly','Monopoly multiplayer',case when e.user_id=v_winner and not coalesce(v_winner_is_bot,false) then 'win' else 'loss' end,
         case when e.user_id=v_winner and not coalesce(v_winner_is_bot,false) then v_reward else 0 end,
         greatest(0,extract(epoch from now()-r.created_at)::integer)
  from public.monopoly_match_escrow e join public.matchmaking_rooms r on r.id=e.room_id where e.room_id=p_room_id;
  return jsonb_build_object('winner_id',v_winner,'winner_points',case when coalesce(v_winner_is_bot,false) then 0 else v_reward end);
end; $$;

grant execute on function public.fund_system_four_player_bot_entries(uuid) to authenticated;
grant execute on function public.fund_system_monopoly_bot_entries(uuid) to authenticated;
