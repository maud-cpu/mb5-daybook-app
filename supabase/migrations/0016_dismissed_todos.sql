-- 0016_dismissed_todos.sql
--
-- Lets a carer dismiss any "Things to do" nudge (unreported incident,
-- band changing soon, missing child details, EDT number missing,
-- training renewal, invoice reminders) the same way reminders and
-- follow-ups already could -- not because the underlying thing is
-- actually resolved, but because they've seen it and don't need it
-- nagging right now. Fully private to the carer; dismissing something
-- never changes the real data it was computed from, so it can always
-- be worked out fresh and the dismissal undone (reopened) later.

create table dismissed_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key text not null,
  text text not null default '',
  dismissed_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table dismissed_todos enable row level security;

create policy "dismissed_todos: owner only"
  on dismissed_todos for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
