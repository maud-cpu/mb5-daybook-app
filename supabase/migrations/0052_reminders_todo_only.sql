-- 0052_reminders_todo_only.sql
--
-- The News & Events "To-do" quick action creates a same-shape reminders
-- row as "Calendar" does (just dated today instead of picked), so it was
-- showing up on the Calendar/mini-calendar too even though it was never
-- meant to be a calendar entry -- only "Add to calendar" should put
-- something there. todo_only marks a reminder as belonging in Up next
-- only; the calendar views filter it out, Up next itself ignores it (it
-- shows every open reminder regardless).

alter table reminders add column todo_only boolean not null default false;
