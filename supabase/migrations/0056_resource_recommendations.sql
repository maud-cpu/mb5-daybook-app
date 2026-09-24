-- 0056_resource_recommendations.sql
--
-- Any carer can suggest a book/movie/podcast/anything worth other carers
-- knowing about -- not a formal training course, so it doesn't belong in
-- shared_training_catalog, but still worth sharing once someone's
-- checked it over. Submissions start pending and only ever become
-- visible to the whole content group once the content owner approves
-- them -- same "only the literal content owner can write shared content"
-- rule as everything else in the shared area (see 0053).

create table resource_recommendations (
  id uuid primary key default gen_random_uuid(),
  household_owner_id uuid not null default content_owner() references auth.users(id),
  suggested_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'other' check (kind in ('book', 'movie', 'podcast', 'other')),
  description text not null default '',
  url text not null default '',
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

alter table resource_recommendations enable row level security;

-- Approved ones are visible to the whole content group; a pending or
-- rejected one is visible only to whoever suggested it (so they can see
-- it's been received) and to the content owner (to actually review it).
create policy "resource_recommendations: read"
  on resource_recommendations for select
  using (
    (status = 'approved' and household_owner_id = content_owner())
    or suggested_by = auth.uid()
    or auth.uid() = household_owner_id
  );

create policy "resource_recommendations: suggest as yourself"
  on resource_recommendations for insert
  with check (suggested_by = auth.uid() and household_owner_id = content_owner());

-- Only the literal content owner can approve/reject/edit or delete --
-- matches every other shared-content write policy in this app.
create policy "resource_recommendations: only the content owner can moderate"
  on resource_recommendations for update
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

create policy "resource_recommendations: only the content owner can delete"
  on resource_recommendations for delete
  using (auth.uid() = household_owner_id);
