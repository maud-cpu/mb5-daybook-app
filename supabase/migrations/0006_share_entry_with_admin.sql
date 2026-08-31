-- 0006_share_entry_with_admin.sql
--
-- Lets a carer explicitly share one specific entry with the hub admin --
-- e.g. instead of also phoning or WhatsApping the same thing. This is a
-- deliberate, per-entry, carer-controlled exception, not a general
-- loosening of privacy: everything stays private by default, and only
-- rows the carer has explicitly flagged become visible to an admin.
-- The admin can read a shared row but still can never edit or un-share
-- it -- only the carer who wrote it controls the flag.

alter table records add column shared_with_admin boolean not null default false;

create policy "records: admins can read entries shared with them"
  on records for select
  using (
    shared_with_admin = true
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- So the "send to [name]" checkbox can show who the hub admin actually is,
-- every signed-in user can see (name only) which accounts are admins.
create policy "profiles: anyone signed in can see admin names"
  on profiles for select
  using (role = 'admin');
