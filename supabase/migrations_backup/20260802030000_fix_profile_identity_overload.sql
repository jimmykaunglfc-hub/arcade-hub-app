-- The legacy four-argument function has default values, so it conflicts with
-- the new backend-configured two-argument profile edit function.
drop function if exists public.update_profile_identity(text, text, integer, integer);
