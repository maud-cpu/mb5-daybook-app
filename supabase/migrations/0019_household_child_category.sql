-- 0019_household_child_category.sql
--
-- A child living in the household who isn't in an active fostering
-- placement (so doesn't need the main children table's band rates,
-- daycare tracking etc) can still usefully be categorised -- adopted,
-- SGO, kinship, a child who themselves fosters, or a current placement
-- recorded here for reference. Reuses the same category vocabulary as
-- the main children table (see lib/types.ts LIVES_CATS).

alter table household_children add column category text not null default '';
