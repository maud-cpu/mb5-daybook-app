-- 0027_handover_profile_household_children.sql
--
-- A handover/sleepover plan should be able to include a household child
-- (own/adopted/SGO/kinship) as well as a fostered one -- they can go on
-- the same sleepover, and now carry the same basics info to draw from.
-- handover_child_profiles.child_id was a strict FK to children(id), so it
-- rejected a household_children row's id outright. RLS (owner-only) is
-- what actually protects this data, not the FK, so it's safe to drop.

alter table handover_child_profiles drop constraint if exists handover_child_profiles_child_id_fkey;
