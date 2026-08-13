-- Normal game clients report the result from the winning player's perspective.
-- Tournament fixtures need a participant-scoped settlement endpoint so that result can
-- update the event standings without requiring an administrator to do it again.
create or replace function public.settle_my_tournament_match(
  target_match uuid,
  my_result text,
  player_one_score_value integer default 0,
  player_two_score_value integer default 0
)
returns public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture public.tournament_matches;
  event public.tournaments;
  normalized_result text := lower(trim(my_result));
  winner uuid;
  loser uuid;
begin
  if normalized_result not in ('win', 'loss', 'draw') then
    raise exception 'Result must be Win, Loss, or Draw';
  end if;

  select * into fixture
  from public.tournament_matches
  where id = target_match
  for update;

  if not found then
    raise exception 'Tournament fixture not found';
  end if;
  if auth.uid() not in (fixture.player_one_id, fixture.player_two_id) then
    raise exception 'You are not a player in this tournament fixture';
  end if;
  if fixture.status = 'completed' then
    return fixture;
  end if;
  if fixture.status = 'cancelled' then
    raise exception 'This tournament fixture has been cancelled';
  end if;

  select * into event from public.tournaments where id = fixture.tournament_id;
  if normalized_result = 'draw' then
    update public.tournament_matches
    set status = 'completed', completed_at = now(),
        player_one_score = player_one_score_value,
        player_two_score = player_two_score_value,
        winner_id = null
    where id = fixture.id
    returning * into fixture;

    update public.tournament_entries
    set score = score + event.draw_points,
        matches_played = matches_played + 1,
        draws = draws + 1
    where tournament_id = fixture.tournament_id
      and user_id in (fixture.player_one_id, fixture.player_two_id);
  else
    winner := case
      when normalized_result = 'win' then auth.uid()
      when auth.uid() = fixture.player_one_id then fixture.player_two_id
      else fixture.player_one_id
    end;
    loser := case when winner = fixture.player_one_id then fixture.player_two_id else fixture.player_one_id end;

    update public.tournament_matches
    set status = 'completed', completed_at = now(),
        player_one_score = player_one_score_value,
        player_two_score = player_two_score_value,
        winner_id = winner
    where id = fixture.id
    returning * into fixture;

    update public.tournament_entries
    set score = score + event.win_points,
        matches_played = matches_played + 1,
        wins = wins + 1
    where tournament_id = fixture.tournament_id and user_id = winner;

    update public.tournament_entries
    set score = score + event.loss_points,
        matches_played = matches_played + 1,
        losses = losses + 1
    where tournament_id = fixture.tournament_id and user_id = loser;
  end if;

  return fixture;
end;
$$;

revoke all on function public.settle_my_tournament_match(uuid, text, integer, integer) from public;
grant execute on function public.settle_my_tournament_match(uuid, text, integer, integer) to authenticated;
notify pgrst, 'reload schema';
