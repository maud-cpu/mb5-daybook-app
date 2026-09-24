-- 0057_household_shared_data.sql
--
-- Every table holding a child's actual day-to-day information (records,
-- reminders, diaries, the household profile, etc.) has been scoped by
-- `user_id = auth.uid()` since day one -- meaning a co-carer added under
-- the existing "co-carer in my own household" option gets their own
-- private, empty copy of everything, unable to see or add to the same
-- children/diary/calendar as the carer who added them. household_owner_id
-- (0043) and content_owner_id (0053) already solved this for admin/carer
-- management and for shared rates/training/rota/news respectively; this
-- does the same for personal child/household data, so a co-carer (e.g. a
-- spouse looking after the children) can genuinely add and edit the same
-- records as anyone else in the household.
--
-- user_id is kept on every table below exactly as it is today -- it
-- becomes the "who actually wrote this" column (still defaulting to
-- auth.uid() on insert, still used by admin_entry_dates()/
-- admin_carer_overview() and the "who wrote this" display in
-- app/admin/shared-entries/page.tsx) while household_owner_id becomes the
-- new *visibility* key.

-- ---------------------------------------------------------------------
-- Part 1: straightforward tables -- add the column, backfill from each
-- row's own owner's household, switch the RLS policy from "owner only"
-- to "shared with my whole household".
-- ---------------------------------------------------------------------

alter table children add column household_owner_id uuid references auth.users(id);
update children c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table children alter column household_owner_id set not null;
alter table children alter column household_owner_id set default household_owner();
drop policy "children: owner only" on children;
create policy "children: household read/write" on children for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table household_children add column household_owner_id uuid references auth.users(id);
update household_children c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table household_children alter column household_owner_id set not null;
alter table household_children alter column household_owner_id set default household_owner();
drop policy "household_children: owner only" on household_children;
create policy "household_children: household read/write" on household_children for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table records add column household_owner_id uuid references auth.users(id);
update records r set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = r.user_id), r.user_id);
alter table records alter column household_owner_id set not null;
alter table records alter column household_owner_id set default household_owner();
drop policy "records: owner only" on records;
create policy "records: household read/write" on records for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());
-- Was project-wide (any admin, any household) -- now that genuinely
-- separate households exist, this must only ever surface entries to an
-- admin from the SAME household as the entry.
drop policy "records: admins can read entries shared with them" on records;
create policy "records: admins can read entries shared with them" on records for select
  using (
    shared_with_admin = true
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin' and p.household_owner_id = records.household_owner_id)
  );

alter table reminders add column household_owner_id uuid references auth.users(id);
update reminders r set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = r.user_id), r.user_id);
alter table reminders alter column household_owner_id set not null;
alter table reminders alter column household_owner_id set default household_owner();
drop policy "reminders: owner only" on reminders;
create policy "reminders: household read/write" on reminders for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());
-- The auto-created "key date" reminder (CLA review / SW statutory visit) is
-- upserted by source_key so re-saving the same date updates one reminder
-- instead of piling up duplicates -- that has to target the household now,
-- not the individual login, or two co-carers editing the same child's date
-- would each get their own copy on the shared calendar.
create unique index reminders_household_source_key_idx
  on reminders (household_owner_id, source_key)
  where source_key is not null;

alter table contacts add column household_owner_id uuid references auth.users(id);
update contacts c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table contacts alter column household_owner_id set not null;
alter table contacts alter column household_owner_id set default household_owner();
drop policy "contacts: owner only" on contacts;
create policy "contacts: household read/write" on contacts for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table child_clubs add column household_owner_id uuid references auth.users(id);
update child_clubs c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table child_clubs alter column household_owner_id set not null;
alter table child_clubs alter column household_owner_id set default household_owner();
drop policy "child_clubs: owner only" on child_clubs;
create policy "child_clubs: household read/write" on child_clubs for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table child_documents add column household_owner_id uuid references auth.users(id);
update child_documents c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table child_documents alter column household_owner_id set not null;
alter table child_documents alter column household_owner_id set default household_owner();
drop policy "child_documents: owner only" on child_documents;
create policy "child_documents: household read/write" on child_documents for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table child_school_admin add column household_owner_id uuid references auth.users(id);
update child_school_admin c set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = c.user_id), c.user_id);
alter table child_school_admin alter column household_owner_id set not null;
alter table child_school_admin alter column household_owner_id set default household_owner();
drop policy "child_school_admin: owner only" on child_school_admin;
create policy "child_school_admin: household read/write" on child_school_admin for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table household_adults add column household_owner_id uuid references auth.users(id);
update household_adults a set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = a.user_id), a.user_id);
alter table household_adults alter column household_owner_id set not null;
alter table household_adults alter column household_owner_id set default household_owner();
drop policy "household_adults: owner only" on household_adults;
create policy "household_adults: household read/write" on household_adults for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table household_visitors add column household_owner_id uuid references auth.users(id);
update household_visitors v set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = v.user_id), v.user_id);
alter table household_visitors alter column household_owner_id set not null;
alter table household_visitors alter column household_owner_id set default household_owner();
drop policy "household_visitors: owner only" on household_visitors;
create policy "household_visitors: household read/write" on household_visitors for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- Part 2: tables with a unique(user_id, ...) constraint the app upserts
-- against by column list -- add a matching unique(household_owner_id,
-- ...) constraint alongside (not replacing) the old one, so two co-carers
-- editing "the same" diary/handover collaborate on one row instead of
-- each creating their own duplicate. The app's onConflict target moves to
-- the new constraint in the same commit as this migration.
-- ---------------------------------------------------------------------

alter table diaries add column household_owner_id uuid references auth.users(id);
update diaries d set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = d.user_id), d.user_id);
alter table diaries alter column household_owner_id set not null;
alter table diaries alter column household_owner_id set default household_owner();
alter table diaries add constraint diaries_household_unique unique (household_owner_id, child_names, date_from, date_to);
drop policy "diaries: owner only" on diaries;
create policy "diaries: household read/write" on diaries for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table handover_plans add column household_owner_id uuid references auth.users(id);
update handover_plans h set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = h.user_id), h.user_id);
alter table handover_plans alter column household_owner_id set not null;
alter table handover_plans alter column household_owner_id set default household_owner();
alter table handover_plans add constraint handover_plans_household_unique unique (household_owner_id, child_names, date_from, date_to);
drop policy "handover_plans: owner only" on handover_plans;
create policy "handover_plans: household read/write" on handover_plans for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table handover_child_profiles add column household_owner_id uuid references auth.users(id);
update handover_child_profiles h set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = h.user_id), h.user_id);
alter table handover_child_profiles alter column household_owner_id set not null;
alter table handover_child_profiles alter column household_owner_id set default household_owner();
alter table handover_child_profiles add constraint handover_child_profiles_household_unique unique (household_owner_id, child_id);
drop policy "handover_child_profiles: owner only" on handover_child_profiles;
create policy "handover_child_profiles: household read/write" on handover_child_profiles for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- Part 3: singleton-per-login tables (primary key IS user_id) -- these
-- need a real primary-key change to allow one shared row per household
-- instead of one per login. Any pre-existing duplicate (a co-carer's own
-- separately-created row) is collapsed down to the household owner's own
-- row, since that's overwhelmingly likely to hold the real, established
-- data -- no co-carer has ever had a working shared view of these before
-- now, so a co-carer's own copy (if one even exists) is expected to be
-- blank.
-- ---------------------------------------------------------------------

alter table household add column household_owner_id uuid references auth.users(id);
update household h set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = h.user_id), h.user_id);
-- Keep exactly one row per household_owner_id -- the owner's own row if one
-- exists (overwhelmingly likely to hold the real, established data), else
-- whichever row was updated most recently, so the primary-key change below
-- can never fail on a leftover duplicate.
delete from household a
  where a.user_id <> (
    select c.user_id from household c
    where c.household_owner_id = a.household_owner_id
    order by (c.user_id = c.household_owner_id) desc, c.updated_at desc, c.user_id
    limit 1
  );
alter table household drop constraint if exists household_pkey;
alter table household add primary key (household_owner_id);
alter table household alter column household_owner_id set not null;
alter table household alter column household_owner_id set default household_owner();
drop policy "household: owner only" on household;
create policy "household: household read/write" on household for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

alter table handovers add column household_owner_id uuid references auth.users(id);
update handovers h set household_owner_id = coalesce((select p.household_owner_id from profiles p where p.id = h.user_id), h.user_id);
delete from handovers a
  where a.user_id <> (
    select c.user_id from handovers c
    where c.household_owner_id = a.household_owner_id
    order by (c.user_id = c.household_owner_id) desc, c.updated_at desc, c.user_id
    limit 1
  );
alter table handovers drop constraint if exists handovers_pkey;
alter table handovers add primary key (household_owner_id);
alter table handovers alter column household_owner_id set not null;
alter table handovers alter column household_owner_id set default household_owner();
drop policy "handovers: owner only" on handovers;
create policy "handovers: household read/write" on handovers for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

-- ---------------------------------------------------------------------
-- Part 4: child_documents' actual files, in Supabase Storage, are keyed
-- by <uploader's auth.uid()>/<filename> folders with policies matching
-- that uid exactly -- sharing the table rows alone would let a co-carer
-- see a document's title but get denied trying to open it. Only read and
-- delete need to change (upload already succeeds into the uploader's own
-- folder regardless of who else is in the household, since that's just
-- where the file lands, not a restriction on who can add one).
-- ---------------------------------------------------------------------

drop policy "child-documents: owner can read" on storage.objects;
create policy "child-documents: household can read" on storage.objects for select
  using (
    bucket_id = 'child-documents'
    and (select p.household_owner_id from profiles p where p.id = (storage.foldername(name))[1]::uuid) = household_owner()
  );

drop policy "child-documents: owner can delete" on storage.objects;
create policy "child-documents: household can delete" on storage.objects for delete
  using (
    bucket_id = 'child-documents'
    and (select p.household_owner_id from profiles p where p.id = (storage.foldername(name))[1]::uuid) = household_owner()
  );
