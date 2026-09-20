-- 0031_dismissed_training_suggestions.sql
--
-- "Suggested from your notes" on Training & Resources surfaces a course
-- straight from what was written in a diary/record entry (records.training_note)
-- -- there's no existing row to hide it from, since the suggestion is worked out
-- fresh from that text every time rather than stored as its own decision.
-- Same idea as dismissed_todos (0016): dismissing never changes the note it
-- came from, so if the same suggestion is written again later it can still
-- come back, and the dismissal itself can be undone (reopened).

create table dismissed_training_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  dismissed_at timestamptz not null default now(),
  unique (user_id, title)
);

alter table dismissed_training_suggestions enable row level security;

create policy "dismissed_training_suggestions: owner only"
  on dismissed_training_suggestions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
