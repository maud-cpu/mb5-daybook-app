-- 0024_reminder_category_child_amount.sql
--
-- Reminders were a flat text+date list. To grow into a proper "what's
-- happening today" calendar (school/club/Surrey comms/personal, what to pay
-- and when, per child) without a whole new table, it needs a way to tag
-- what kind of reminder this is, which child it's about, and how much (if
-- anything) is due -- so the Capture-page "Today" card and the top-right
-- quick-access icon can group and filter sensibly.

alter table reminders add column category text not null default '';
alter table reminders add column child text not null default '';
alter table reminders add column amount numeric;
