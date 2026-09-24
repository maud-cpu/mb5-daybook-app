-- 0060_amendment_author_badges.sql
--
-- Same problem as records (0059): now that a household's calendar, diary
-- and handover plan/profiles are all genuinely shared between co-carers
-- (0057), there's no way to tell who wrote or last amended any of them.
-- Each already has (or, for reminders, already had a plain) user_id
-- recording who *created* the row -- add edited_by so an amendment by a
-- co-carer is distinguishable from the row's original author.

alter table reminders add column edited_by uuid references auth.users(id);
alter table diaries add column edited_by uuid references auth.users(id);
alter table handover_plans add column edited_by uuid references auth.users(id);
alter table handover_child_profiles add column edited_by uuid references auth.users(id);
