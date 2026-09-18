-- 0023_household_mockingbird.sql
--
-- A child's own Mockingbird hub-carer details (0010) cover a visiting
-- child who belongs to someone else's constellation. This is the other
-- direction: whether THIS family is itself part of a Mockingbird
-- constellation, and if so who runs it -- a household-level fact, not
-- a per-child one.

alter table household add column is_mockingbird boolean;
alter table household add column hub_leader_name text not null default '';
alter table household add column hub_leader_phone text not null default '';
alter table household add column hub_leader_email text not null default '';
