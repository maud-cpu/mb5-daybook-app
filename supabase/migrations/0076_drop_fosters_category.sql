-- "Child who fosters (inc. adopted & SGO)" turned out to be no real
-- category at all -- it mislabelled the carer's own birth children who'd
-- been marked "adopted", reading as if they themselves were a foster
-- carer. A permanent family member who isn't an active placement (own,
-- adopted, SGO, or someone who happens to themselves foster) is just
-- blank -- the same "— placement type —" a plain birth child already
-- uses. This covers anyone still on the older "sgo"/"adopted" values too,
-- in case 0075 hasn't been run yet.
update children set category = '' where category in ('fosters', 'sgo', 'adopted');
update household_children set category = '' where category in ('fosters', 'sgo', 'adopted');
