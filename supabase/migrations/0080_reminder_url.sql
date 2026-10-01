-- A reminder extracted from a pasted email/message can carry a link for
-- where to actually act on it (RSVP, log in, pay, book) -- see 0079's
-- sibling work in extract-events/sort. Not in ENC_FIELDS: a bare URL
-- isn't personal/identifying information the way the reminder's own text
-- can be.
alter table reminders add column if not exists url text;
