-- 0009_household_adults.sql
--
-- Other adults living in the carer's household (an adult child, a
-- live-in grandparent, etc), separate from the carer's own account.
-- Private, same as everything else about the household.

create table household_adults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  role text not null default 'Other',
  created_at timestamptz not null default now()
);

alter table household_adults enable row level security;

create policy "household_adults: owner only"
  on household_adults for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
