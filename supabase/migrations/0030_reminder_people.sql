-- 0030_reminder_people.sql
--
-- A calendar entry needing more than one person (a family trip involving
-- every child, an adult too, or someone entirely outside the household)
-- couldn't be tagged with more than a single child before -- "child" was
-- one text field. people is a plain text array of names (matching the
-- existing records.kids convention: names, not ids, since it can include
-- adults and one-off people who have no row anywhere in this database).
-- Existing single-child tags are copied across so nothing already saved
-- is lost; the old child column is left in place, just no longer written.

alter table reminders add column people text[] not null default '{}';

update reminders set people = array[child] where child <> '' and people = '{}';
