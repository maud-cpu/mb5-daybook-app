-- "SGO" and "Adopted" are merged into "Child who fosters (inc. adopted &
-- SGO)" -- the carer's own choice, since day-to-day these are all the same
-- thing: a permanent family member, not an active placement. Existing rows
-- carrying the old, now-removed category values move to "fosters" so
-- nothing is left showing a category the app no longer offers.
update children set category = 'fosters' where category in ('sgo', 'adopted');
update household_children set category = 'fosters' where category in ('sgo', 'adopted');
