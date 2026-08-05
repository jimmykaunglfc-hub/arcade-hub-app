-- The winner is always the seat whose server-owned hand reached zero.
-- This trigger protects results from any older client/RPC implementation that
-- might otherwise write a relative "next seat" value after the final play.
create or replace function public.enforce_big_two_winner()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_winner smallint;
begin
  if new.status = 'completed' then
    select seat into v_winner
    from public.big_two_player_hands
    where room_id = new.room_id and jsonb_array_length(cards) = 0
    order by seat
    limit 1;
    if v_winner is not null then
      new.state := jsonb_set(coalesce(new.state,'{}'::jsonb), '{winner_seat}', to_jsonb(v_winner));
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists big_two_authoritative_winner on public.big_two_match_state;
create trigger big_two_authoritative_winner
before update of state,status on public.big_two_match_state
for each row execute function public.enforce_big_two_winner();
