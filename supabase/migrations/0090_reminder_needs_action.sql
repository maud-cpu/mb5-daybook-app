-- Distinguishes a genuine to-do reminder (pay an invoice, fill in a booking
-- form) from a plain calendar/presence marker (a child staying over, a
-- one-off day care session) -- both live in the same reminders table, but
-- only the former belongs in "Up next", where ticking it off marks it done.
-- Ticking off a presence marker there was being mistaken for a to-do
-- checkbox and silently removing the child from today's calendar. Defaults
-- true so every reminder already relied on to show in Up next keeps doing so.
alter table reminders add column if not exists needs_action boolean not null default true;
