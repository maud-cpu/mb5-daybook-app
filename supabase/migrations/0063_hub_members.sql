-- 0063_hub_members.sql
--
-- A simple roster of who's actually in the carer's Mockingbird hub (the
-- fellow carers in her constellation) -- lets Capture's AI sort match a
-- name mentioned in a note against a KNOWN list, rather than having to
-- judge from context alone whether something counts as "hub news". Any
-- note naming someone on this list is hub news, full stop.
-- Shared with the whole household like everything else in that model (0057).

create table hub_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  household_owner_id uuid not null default household_owner() references auth.users(id),
  name text not null,
  created_at timestamptz not null default now()
);

alter table hub_members enable row level security;

create policy "hub_members: household read/write" on hub_members for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());
