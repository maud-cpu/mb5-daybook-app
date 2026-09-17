-- 0018_household_children_and_visitors.sql
--
-- Two gaps in "About us": the carer's own children living in the house
-- (not in placement, so they don't belong in the `children` table which is
-- specifically for fostered children with band rates, training links etc)
-- and people who visit regularly without living there -- another
-- Mockingbird hub's carer, a respite support worker, a family friend who
-- helps out. Both private to the carer, same pattern as household_adults.

create table household_children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  born date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table household_children enable row level security;

create policy "household_children: owner only"
  on household_children for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table household_visitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  phone text not null default '',
  email text not null default '',
  role text not null default 'Other',
  created_at timestamptz not null default now()
);

alter table household_visitors enable row level security;

create policy "household_visitors: owner only"
  on household_visitors for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
