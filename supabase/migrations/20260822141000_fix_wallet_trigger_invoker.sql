-- The wallet guard must inspect the role that initiated the UPDATE. A trigger
-- invoked by a SECURITY DEFINER reward/purchase RPC sees that trusted function
-- owner; a direct PostgREST update sees authenticated/anon and is rejected.
alter function public.prevent_untrusted_wallet_balance_update() security invoker;

notify pgrst, 'reload schema';
