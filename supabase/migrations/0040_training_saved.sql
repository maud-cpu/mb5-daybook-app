-- Lets a carer flag a training/resource to come back to later, separate
-- from "completed" (training_progress) and "not interested"
-- (dismissed_training_suggestions) -- there was no way to bookmark
-- something worth reading later without either marking it done or
-- dismissing it outright.
create table training_saved (
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, title)
);

alter table training_saved enable row level security;

create policy "training_saved: owner only"
  on training_saved for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
