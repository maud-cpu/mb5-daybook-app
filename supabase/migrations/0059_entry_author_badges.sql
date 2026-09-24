-- 0059_entry_author_badges.sql
--
-- Now that co-carers share the same Entries log (0057), there's no way to
-- tell your own observations apart from a co-carer's at a glance -- everyone
-- needs to be able to see who actually wrote (or amended) each entry, not
-- just admins reviewing shared_with_admin rows.

-- profiles' existing read policies only let you see your own row (or, for
-- an admin, everyone in your own household) -- extend that to any household
-- member reading any other household member's row, so a display name can be
-- looked up for attribution.
create policy "profiles: household members can read each other"
  on profiles for select
  using (household_owner_id = household_owner());

-- records already has `edited` (a timestamp, bumped on every edit) but
-- nothing recording *who* made that edit -- add edited_by so an amendment
-- by a co-carer is distinguishable from the entry's original author.
alter table records add column edited_by uuid references auth.users(id);
