-- 0022_household_child_basics.sql
--
-- A child in "Children in your household" (your own, adopted, SGO, kinship)
-- can still have real social work involvement, health needs and school
-- details worth keeping at a glance -- there's no reason they should get a
-- thinner record than a fostered child just because they live in a
-- different list. Mirrors the same columns the main children table already
-- has (0010_child_category_mockingbird.sql, 0001's basics jsonb), minus
-- lives_here/family which don't apply here.

alter table household_children add column basics jsonb not null default '{}'::jsonb;
alter table household_children add column mockingbird text not null default '';
alter table household_children add column hub_carer_name text not null default '';
alter table household_children add column hub_carer_phone text not null default '';
alter table household_children add column hub_carer_email text not null default '';
alter table household_children add column surrey_contact text not null default '';
