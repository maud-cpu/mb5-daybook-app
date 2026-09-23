-- 0049_rota_hours_text.sql
--
-- 0048's hours_from/hours_to (a single daily time range) turned out not to
-- fit reality: a real rota document reads "Open from 6pm to 11pm Monday to
-- Friday and 10am to 11pm on Saturday/Sunday and all Bank Holidays" -- a
-- genuinely compound weekday/weekend rule, which two time fields can't
-- represent. Replaced with one free-text description the admin can paste
-- straight from the rota document's own header, shown verbatim rather
-- than forced into a shape that loses the actual rule. No real rows exist
-- yet (shipped minutes ago), so this is a straight column swap, not a
-- migration of existing data.

alter table shared_rota_hours drop column hours_from;
alter table shared_rota_hours drop column hours_to;
alter table shared_rota_hours add column description text not null default '';
