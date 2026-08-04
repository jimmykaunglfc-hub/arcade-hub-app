-- Players may read active reward rules so their dashboard can accurately show
-- the benefits they can earn. Rule administration remains admin-only.
create policy "players view active referral milestone rules" on public.referral_milestone_rules for select to authenticated using (is_active = true);
create policy "players view active referral purchase rules" on public.referral_purchase_rules for select to authenticated using (is_active = true);
