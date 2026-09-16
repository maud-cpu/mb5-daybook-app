-- 0013_fix_profiles_admin_policy_recursion.sql
--
-- The "profiles: admins read all rows" policy from migration 0001 checks
-- "is this user an admin?" by querying profiles itself:
--
--   using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
--
-- To decide whether that policy applies, Postgres has to run that inner
-- query -- which is itself a select on profiles, so it has to apply every
-- select policy on profiles again, including this one. That's genuine
-- infinite recursion, and Postgres detects and rejects it with
-- "infinite recursion detected in policy for relation \"profiles\"".
--
-- Because several other tables (shared_rates, the training catalog, the
-- share-one-entry-with-admin feature on records) check admin status the
-- same inline way, and each of those checks queries profiles too, almost
-- any read that touches an admin-gated policy can trip this -- which is
-- why rates wouldn't load and saved entries seemed to vanish.
--
-- is_admin() (migration 0003) answers the same question but is
-- SECURITY DEFINER, so its internal query bypasses RLS entirely instead
-- of re-triggering it. Swapping the profiles policy to use it breaks the
-- recursion at its source; every other table's admin check then resolves
-- fine too, since the recursion could only ever start from here.

drop policy "profiles: admins read all rows" on profiles;

create policy "profiles: admins read all rows"
  on profiles for select
  using (is_admin());
