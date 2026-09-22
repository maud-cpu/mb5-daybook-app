-- A placement (looked after or a regular visitor like a sleepover/daycare
-- child) has a point where it ends and the carer's own diary/expenses/meds
-- records for that child stop being needed day-to-day -- they should be
-- passed to the supervising social worker or removed, per the fostering
-- provider's record-retention policy. Nothing tracked that date before, so
-- there was no way to be nudged about it.
alter table children add column if not exists placement_end_date date;
