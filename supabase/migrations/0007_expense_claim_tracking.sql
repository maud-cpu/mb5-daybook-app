-- 0007_expense_claim_tracking.sql
--
-- Tracks whether an expense has been claimed and/or actually paid, so the
-- Payday reminder and the expenses claim doc can tell what's still
-- outstanding. Private, same as the rest of `records`.

alter table records add column claimed boolean not null default false;
alter table records add column claimed_at timestamptz;
alter table records add column paid boolean not null default false;
alter table records add column paid_at timestamptz;
