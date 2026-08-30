-- 0005_default_user_id.sql
--
-- Lets the app insert a row without having to pass user_id explicitly --
-- it defaults to whoever is signed in. Row Level Security still checks
-- the value on every insert regardless, so this is a convenience, not a
-- relaxation of the privacy rules.

alter table children alter column user_id set default auth.uid();
alter table records alter column user_id set default auth.uid();
alter table contacts alter column user_id set default auth.uid();
alter table household alter column user_id set default auth.uid();
alter table handovers alter column user_id set default auth.uid();
alter table reminders alter column user_id set default auth.uid();
alter table training_progress alter column user_id set default auth.uid();
alter table carer_settings alter column user_id set default auth.uid();
