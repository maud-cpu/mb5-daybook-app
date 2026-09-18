-- 0021_training_ratings.sql
--
-- Two separate kinds of rating for a training resource: an external
-- rating (looked up from public reviews -- Amazon, Goodreads etc -- and
-- filled in by admin/Claude, not by carers), and feedback from the
-- household's own carers who've actually used the resource. Both are
-- shown together on the Training tab so a carer picking between several
-- options for the same subject has more than just a title to go on.

alter table shared_training_catalog add column external_rating numeric;
alter table shared_training_catalog add column external_rating_note text not null default '';

create table training_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references shared_training_catalog(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

alter table training_feedback enable row level security;

-- Feedback is shared across the household, same as the catalogue itself --
-- everyone benefits from seeing what another carer thought of a resource.
create policy "training_feedback: any signed-in user can read"
  on training_feedback for select
  using (auth.uid() is not null);

create policy "training_feedback: a carer manages their own rating"
  on training_feedback for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
