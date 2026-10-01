-- A visiting/day care child's "category" column holds WHY they visit (one
-- of VISITS_CATS: sleepover, daycare, etc) -- it has nowhere to also record
-- their own underlying placement type (foster, kinship, SGO, adopted...),
-- which is a separate, independent fact (a visiting child can be kinship
-- AND daycare, foster AND daycare, etc). The carer needs this for her
-- Mockingbird-number and expense-claim rules, which key off placement type,
-- not visit reason. Only meaningful for a visiting child (lives_here =
-- false); always '' for a household child, where "category" already holds
-- this directly.
alter table children add column placement_category text not null default '';
