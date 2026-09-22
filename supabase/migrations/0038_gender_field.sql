-- 0038_gender_field.sql
--
-- A carer's raw notes and the AI-drafted handover/diary text have no way to
-- know a child's pronouns from their name alone, and got it wrong for a
-- child whose name doesn't obviously read as one gender or the other.
-- Recording it once here lets generated documents use the right pronoun
-- instead of guessing from the name.

alter table children add column if not exists gender text not null default '';
alter table household_children add column if not exists gender text not null default '';
alter table household_adults add column if not exists gender text not null default '';
alter table household_visitors add column if not exists gender text not null default '';
