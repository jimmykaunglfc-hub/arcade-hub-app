-- Authoritative points staking for every non-solo competitive match.
-- An active stake is collected once per player/game, then settled once when
-- the game reports Win, Loss, or Draw.

create table if not exists public.competitive_match_stakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_title text not null,
  opponent_name text not null default 'Online Opponent',
  entry_fee integer not null check (entry_fee >= 0),
  status text not null default 'active' check (status in ('active', 'settled', 'cancelled')),
  result text,
  payout integer not null default 0 check (payout >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists competitive_match_stakes_active_idx
  on public.competitive_match_stakes(user_id, game_title, created_at desc)
  where status = 'active';

alter table public.competitive_match_stakes enable row level security;

drop policy if exists "players read own competitive stakes" on public.competitive_match_stakes;
create policy "players read own competitive stakes"
  on public.competitive_match_stakes
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.enter_competitive_match(
  p_game_title text,
  p_entry_fee integer,
  p_opponent_name text default 'Online Opponent'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stake public.competitive_match_stakes;
  v_points integer;
  v_fee integer := greatest(coalesce(p_entry_fee, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Sign in to enter a competitive match';
  end if;

  -- Repeated UI events, reconnection, and the host's later Enter button must
  -- reuse the same active stake instead of charging a second time.
  select * into v_stake
  from public.competitive_match_stakes
  where user_id = auth.uid()
    and game_title = coalesce(nullif(trim(p_game_title), ''), 'Arena Game')
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_stake.id is not null then
    select coalesce(points, 0) into v_points from public.profiles where id = auth.uid();
    return jsonb_build_object(
      'success', true,
      'stake_id', v_stake.id,
      'match_id', v_stake.id,
      'new_points', v_points,
      'reused', true
    );
  end if;

  select coalesce(points, 0) into v_points
  from public.profiles
  where id = auth.uid()
  for update;

  if v_points < v_fee then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  update public.profiles
  set points = coalesce(points, 0) - v_fee
  where id = auth.uid()
  returning points into v_points;

  insert into public.competitive_match_stakes(user_id, game_title, opponent_name, entry_fee)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_game_title), ''), 'Arena Game'),
    coalesce(nullif(trim(p_opponent_name), ''), 'Online Opponent'),
    v_fee
  )
  returning * into v_stake;

  return jsonb_build_object(
    'success', true,
    'stake_id', v_stake.id,
    'match_id', v_stake.id,
    'new_points', v_points,
    'reused', false
  );
end;
$$;

create or replace function public.settle_competitive_match(
  p_stake_id uuid,
  p_result text,
  p_game_id text default null,
  p_duration_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stake public.competitive_match_stakes;
  v_result text := lower(trim(coalesce(p_result, 'loss')));
  v_payout integer;
  v_points integer;
begin
  select * into v_stake
  from public.competitive_match_stakes
  where id = p_stake_id
    and user_id = auth.uid()
  for update;

  if v_stake.id is null then
    raise exception 'Competitive stake not found';
  end if;

  if v_stake.status = 'settled' then
    select coalesce(points, 0) into v_points from public.profiles where id = auth.uid();
    return jsonb_build_object('success', true, 'payout', v_stake.payout, 'new_points', v_points, 'already_settled', true);
  end if;

  if v_result not in ('win', 'loss', 'draw') then
    raise exception 'Unsupported match result';
  end if;

  -- Both human players have put in an entry fee, so the winner takes two
  -- entries. A bot has no wallet: losing to it sends the collected entry back
  -- to the system, while beating it receives the advertised two-entry prize.
  v_payout := case
    when v_result = 'win' then v_stake.entry_fee * 2
    when v_result = 'draw' then v_stake.entry_fee
    else 0
  end;

  update public.profiles
  set points = coalesce(points, 0) + v_payout
  where id = auth.uid()
  returning points into v_points;

  update public.competitive_match_stakes
  set status = 'settled',
      result = initcap(v_result),
      payout = v_payout,
      settled_at = now()
  where id = v_stake.id;

  insert into public.match_history(
    user_id, game_id, game_title, opponent_name, result, points_change, duration_seconds
  )
  values (
    auth.uid(), p_game_id, v_stake.game_title, v_stake.opponent_name,
    initcap(v_result), v_payout, greatest(coalesce(p_duration_seconds, 0), 0)
  );

  return jsonb_build_object('success', true, 'payout', v_payout, 'new_points', v_points);
end;
$$;

grant execute on function public.enter_competitive_match(text, integer, text) to authenticated;
grant execute on function public.settle_competitive_match(uuid, text, text, integer) to authenticated;
