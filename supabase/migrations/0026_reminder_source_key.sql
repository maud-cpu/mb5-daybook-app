-- 0026_reminder_source_key.sql
--
-- A statutory "next due" date (CLA review, SW statutory visit) set in a
-- child's basics should show up on the calendar automatically, and stay
-- in sync as a single entry rather than piling up a new one every time
-- the date is updated. source_key gives each such auto-created reminder
-- a stable identity (e.g. "review:<child id>") so it can be upserted --
-- unique per carer, and only enforced when actually set.

alter table reminders add column source_key text;

create unique index reminders_user_source_key_idx
  on reminders (user_id, source_key)
  where source_key is not null;
