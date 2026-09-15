-- 0010_child_category_mockingbird.sql
--
-- Distinguishes a child who lives with the carer from one who just visits
-- (sleepover / daycare / short break), what category of placement it is,
-- and Mockingbird hub-carer details for a visiting child -- so an entry
-- about a visiting child can offer to send a note to their own carer.

alter table children add column category text not null default '';
alter table children add column lives_here boolean;
alter table children add column mockingbird text not null default '';
alter table children add column hub_carer_name text not null default '';
alter table children add column hub_carer_phone text not null default '';
alter table children add column hub_carer_email text not null default '';
alter table children add column surrey_contact text not null default '';
