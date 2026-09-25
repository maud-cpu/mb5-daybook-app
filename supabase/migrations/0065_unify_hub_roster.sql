-- 0065_unify_hub_roster.sql
--
-- hub_members (0063/0064) was a separate list purely for matching text in
-- Capture -- but the carer expects "adding someone to my hub" to be ONE
-- action, reflected on the About Us circles too, not a second list that
-- never shows up there. household_visitors (the Visitors wheel) plus a
-- visiting child's linked_visitor_id (0062) already model exactly this --
-- an adult, and the children linked to them -- so hub_members' job folds
-- into that instead of staying a parallel structure.
--
-- Existing hub_members rows are carried over rather than dropped: a
-- carer/partner becomes a household_visitors row (role "Mockingbird hub
-- carer"), a child becomes a visiting child (lives_here = false) linked to
-- their household's carer, matched by household_label. A child whose
-- household has no carer row (an edge case -- shouldn't normally happen)
-- is skipped rather than saved half-linked; the carer can add them back
-- from About Us if that happens.

insert into household_visitors (user_id, household_owner_id, name, role)
select user_id, household_owner_id, name, 'Mockingbird hub carer'
from hub_members
where role in ('carer', 'partner');

insert into children (user_id, household_owner_id, name, lives_here, category, linked_visitor_id)
select
  hm.user_id,
  hm.household_owner_id,
  hm.name,
  false,
  '',
  hv.id
from hub_members hm
join hub_members carer
  on carer.household_owner_id = hm.household_owner_id
  and carer.household_label = hm.household_label
  and carer.role = 'carer'
join household_visitors hv
  on hv.household_owner_id = hm.household_owner_id
  and hv.name = carer.name
  and hv.role = 'Mockingbird hub carer'
where hm.role = 'child' and hm.household_label is not null;

drop table hub_members;
