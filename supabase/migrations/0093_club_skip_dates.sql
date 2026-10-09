-- A club happens every week on its set day with no end date -- but a real
-- club does take breaks (half term, the instructor's away, a one-off
-- cancellation). Previously the only way to stop a week showing on the
-- calendar was deleting the club outright and re-adding it afterwards.
-- skip_dates holds the specific dates (YYYY-MM-DD) this club's own weekly
-- occurrence should NOT show for -- checked by the calendar's own virtual-
-- occurrence generator, never a real reminders row of its own.
alter table child_clubs add column if not exists skip_dates jsonb not null default '[]'::jsonb;
