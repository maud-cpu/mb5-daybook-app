-- A reminder only ever had a date, never a time -- fine for a plain day
-- marker, but loses "10:30 until 12:30" or "be at school at 8:45" from the
-- text it actually came from. Same native `time` column type and HH:MM
-- convention as records.time_from/time_to (0001), so a real start/end time
-- can be shown and, eventually, carried into a proper .ics export instead
-- of always exporting as an all-day event.
alter table reminders add column if not exists time_from time;
alter table reminders add column if not exists time_to time;
