-- 0028_reminder_source_text.sql
--
-- A calendar entry created from "Paste an email" keeps the original
-- email text alongside it, so an "i" on the entry can show exactly what
-- it was extracted from later -- the extracted one-liner is a summary,
-- not the whole story (times, links, other context often sit in the
-- original that didn't make it into the short calendar text).

alter table reminders add column source_text text not null default '';
