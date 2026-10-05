-- A child's social worker (CSW) was a separate free-text name/phone/email
-- on every single child's own basics -- so two siblings (even split across
-- different carers in the same agency group) with the very same CSW each
-- held their own separate copy, with nothing keeping them in step: a phone
-- number change had to be re-typed on every child by every carer who had
-- one, or it quietly went stale everywhere else. shared_social_workers is
-- one directory per content group (same sharing model as shared_rates/
-- shared_training_catalog -- see 0053_content_owner.sql), managed by the
-- content owner (the admin), with every child in the group just linking to
-- one of its rows instead of holding its own copy.
--
-- SSW (the carer's own supervising social worker) already lives once per
-- household (household.ssw_*, see components/AboutScreen.tsx) and needs no
-- change -- this is purely the CSW side.

create table shared_social_workers (
  id uuid primary key default gen_random_uuid(),
  household_owner_id uuid not null references auth.users(id) default content_owner(),
  name text not null default '',
  name_enc text,
  phone text not null default '',
  phone_enc text,
  email text not null default '',
  email_enc text,
  created_at timestamptz not null default now()
);

alter table shared_social_workers enable row level security;

create policy "shared_social_workers: read own content group"
  on shared_social_workers for select
  using (household_owner_id = content_owner());

create policy "shared_social_workers: only the content owner can write"
  on shared_social_workers for all
  using (auth.uid() = household_owner_id)
  with check (auth.uid() = household_owner_id);

-- Deleting a directory entry un-links any child pointing at it rather than
-- failing or cascading -- a carer removing a stale/duplicate entry
-- shouldn't need to touch every child linked to it first.
alter table children add column if not exists csw_contact_id uuid references shared_social_workers(id) on delete set null;
alter table household_children add column if not exists csw_contact_id uuid references shared_social_workers(id) on delete set null;
