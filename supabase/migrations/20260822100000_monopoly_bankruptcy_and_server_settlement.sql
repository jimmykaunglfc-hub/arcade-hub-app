-- Monopoly must settle on the server when its persisted board reaches an end
-- state.  Client-side settlement can race the final state publication and was
-- therefore able to display a reward without crediting the wallet.

create table if not exists public.monopoly_match_settlements (
  room_id uuid primary key references public.matchmaking_rooms(id) on delete cascade,
  winner_id uuid not null,
  circulation_balance bigint not null check (circulation_balance > 0),
  winner_points bigint not null check (winner_points >= 0),
  settled_at timestamptz not null default now()
);

alter table public.monopoly_match_settlements enable row level security;

create or replace function public.settle_monopoly_match_completion(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_winner uuid;
  v_circulation bigint;
  v_reward bigint;
  v_winner_is_bot boolean := true;
  v_existing public.monopoly_match_settlements;
begin
  -- Lock the state row first so a trigger, reconnecting client, or timeout
  -- worker can never settle the same completed board twice.
  select state
  into v_state
  from public.monopoly_match_state
  where room_id = p_room_id
    and status = 'completed'
  for update;

  if v_state is null then
    raise exception 'Monopoly match is not completed';
  end if;

  select * into v_existing
  from public.monopoly_match_settlements
  where room_id = p_room_id;

  if found then
    return jsonb_build_object(
      'settled', true,
      'already_settled', true,
      'winner_id', v_existing.winner_id,
      'total_match_currency', v_existing.circulation_balance,
      'winner_points', v_existing.winner_points
    );
  end if;

  v_winner := nullif(v_state ->> 'winnerId', '')::uuid;
  if v_winner is null then
    raise exception 'No Monopoly winner was recorded';
  end if;

  if jsonb_typeof(v_state -> 'players') <> 'array'
     or (select count(*) from jsonb_array_elements(v_state -> 'players') player
         where not coalesce((player ->> 'bankrupt')::boolean, false)) <> 1 then
    raise exception 'Monopoly match is not in a valid end state';
  end if;

  v_circulation := greatest(0, coalesce((v_state ->> 'circulationBalance')::bigint, 0));
  if v_circulation = 0 then
    raise exception 'Invalid Monopoly circulation balance';
  end if;

  v_reward := floor(v_circulation * 0.10);
  select coalesce(is_bot, true)
  into v_winner_is_bot
  from public.matchmaking_room_players
  where room_id = p_room_id
    and user_id = v_winner
  limit 1;

  if not found then
    v_winner_is_bot := true;
  end if;

  insert into public.monopoly_match_settlements(room_id, winner_id, circulation_balance, winner_points)
  values (p_room_id, v_winner, v_circulation, case when v_winner_is_bot then 0 else v_reward end);

  if not v_winner_is_bot then
    perform set_config('app.wallet_activity_type', 'monopoly_match_reward', true);
    perform set_config(
      'app.wallet_activity_description',
      format('Monopoly match reward: %s points', v_reward),
      true
    );
    update public.profiles
    set points = coalesce(points, 0) + v_reward
    where id = v_winner;
  end if;

  update public.monopoly_match_escrow
  set status = 'settled'
  where room_id = p_room_id
    and status = 'held';

  update public.monopoly_match_bot_escrow
  set status = 'settled', settled_at = now()
  where room_id = p_room_id
    and status = 'held';

  update public.matchmaking_rooms
  set status = 'completed'
  where id = p_room_id;

  insert into public.match_history(
    user_id, game_title, opponent_name, result, points_change, duration_seconds
  )
  select
    escrow.user_id,
    'Monopoly',
    'Monopoly multiplayer',
    case when escrow.user_id = v_winner and not v_winner_is_bot then 'win' else 'loss' end,
    case when escrow.user_id = v_winner and not v_winner_is_bot then v_reward else 0 end,
    greatest(0, extract(epoch from now() - room.created_at)::integer)
  from public.monopoly_match_escrow escrow
  join public.matchmaking_rooms room on room.id = escrow.room_id
  where escrow.room_id = p_room_id;

  return jsonb_build_object(
    'settled', true,
    'winner_id', v_winner,
    'total_match_currency', v_circulation,
    'winner_points', case when v_winner_is_bot then 0 else v_reward end
  );
end;
$$;

-- Preserve the existing public RPC for older app packages, but make it a safe
-- wrapper around the idempotent server settlement implementation.
create or replace function public.settle_completed_monopoly_match(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.matchmaking_room_players
    where room_id = p_room_id
      and user_id = auth.uid()
      and left_at is null
  ) then
    raise exception 'Only an active Monopoly player can settle this match';
  end if;

  return public.settle_monopoly_match_completion(p_room_id);
end;
$$;

create or replace function public.settle_monopoly_match_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.settle_monopoly_match_completion(new.room_id);
  end if;
  return new;
end;
$$;

drop trigger if exists monopoly_match_completion_settlement on public.monopoly_match_state;
create trigger monopoly_match_completion_settlement
after update of status on public.monopoly_match_state
for each row
when (new.status = 'completed' and old.status is distinct from 'completed')
execute function public.settle_monopoly_match_on_completion();

grant execute on function public.settle_completed_monopoly_match(uuid) to anon, authenticated, service_role;
grant execute on function public.settle_monopoly_match_completion(uuid) to service_role;

notify pgrst, 'reload schema';
