-- A daycare/expense entry that also produces a calendar reminder used to be
-- saved as two disconnected rows: the priced record (records) and a one-off
-- text snapshot (reminders), with nothing tying them together. Editing the
-- reminder's date/duration on the calendar could never reach the record
-- Entries and Expenses actually read, so the two silently drifted apart.
-- This column lets the calendar edit the real record directly when one
-- exists, instead of only ever touching its own copy.
alter table reminders add column record_id uuid references records(id) on delete set null;
