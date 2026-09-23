-- training_saved.user_id had no default (unlike training_feedback's,
-- which explicitly learned this exact lesson in 0021) -- every insert
-- from the "Save for later" button omits it entirely, since it's implicit
-- ("save this for me") rather than something the carer picks. Without a
-- default that silently fails the not-null constraint on every save (the
-- button optimistically updates on-screen state, so it looked like it
-- worked). Add the same default used everywhere else a user's own row is
-- stamped automatically.
alter table training_saved alter column user_id set default auth.uid();
