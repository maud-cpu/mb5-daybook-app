-- 0025_reminder_series.sql
--
-- Recurring calendar entries (a weekly club, a monthly club fee) are
-- created as real one-per-occurrence rows rather than a virtual repeat
-- rule -- simplest to get right, and every existing bit of code that
-- already reads the reminders table (due-today, the ICS export, Today
-- card) just works on them unchanged. series_id ties the occurrences of
-- one recurring entry together so a later "stop repeating" can remove
-- the rest of a series without touching ones already marked done.

alter table reminders add column series_id uuid;
