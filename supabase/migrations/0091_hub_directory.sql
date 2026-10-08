-- A household's own admin-maintained list of Mockingbird hub carers --
-- lets "Your Mockingbird" (About us) offer a "which hub?" picker that
-- auto-fills the hub carer's phone/email, instead of every co-carer typing
-- the same details by hand. Same household-shared, admin-writable pattern
-- as shared_training_platforms/shared_rates (0002, narrowed to per-
-- household in 0043) -- read by anyone in the household, written only by
-- its admin. No separate "hub name" column: it's always derived from
-- carer_name ("Maud" -> "Maud's hub"), so renaming a carer can never leave
-- a stale hub name behind.
-- carer_name/phone/email are real identifying contact details for a real
-- person, same as every other hub/SSW/CSW contact in this app -- encrypted
-- at rest from day one (the _enc columns), same dual-write pattern as
-- household's own hub_leader_* fields (see 0067).
create table shared_hub_directory (
  id uuid primary key default gen_random_uuid(),
  household_owner_id uuid not null references auth.users(id) default household_owner(),
  carer_name text not null default '',
  carer_name_enc text,
  phone text not null default '',
  phone_enc text,
  email text not null default '',
  email_enc text,
  created_at timestamptz not null default now()
);

alter table shared_hub_directory enable row level security;

create policy "shared_hub_directory: household can read"
  on shared_hub_directory for select
  using (household_owner_id = household_owner());

create policy "shared_hub_directory: admin can write"
  on shared_hub_directory for all
  using (is_admin() and household_owner_id = household_owner())
  with check (is_admin() and household_owner_id = household_owner());
