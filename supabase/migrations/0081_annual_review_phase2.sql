-- Phase 2 of Annual Review (see 0079): the written review itself (fillable
-- boxes), carer-level document uploads to go with it, and when it was
-- actually sent to the SW -- all living in Paperwork -> Annual review,
-- while the review date and requirements checklist stay in About Us (see
-- 0079's own comment on why -- one editable place per fact).

alter table household add column if not exists annual_review_notes jsonb not null default '{}'::jsonb;
alter table household add column if not exists annual_review_sent_at date;

-- household_documents: a carer-level document library, same shape and
-- reasoning as child_documents (0047) but for documents that belong to the
-- household/carer rather than any one child -- insurance confirmation, DBS
-- certificate, safer care policy, etc. Shared across the whole household
-- from the start (child_documents only gained this in 0057), since every
-- co-carer should see the same annual review paperwork.
create table household_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  household_owner_id uuid not null references auth.users(id) default household_owner(),
  title text not null default '',
  category text not null default '',
  file_path text not null,
  file_name text not null default '',
  uploaded_at timestamptz not null default now()
);

alter table household_documents enable row level security;

create policy "household_documents: household read/write"
  on household_documents for all
  using (household_owner_id = household_owner())
  with check (household_owner_id = household_owner());

-- Same private-bucket pattern as child-documents (0047/0057): any file type,
-- uploaded into the uploader's own folder (path: <user_id>/<filename>), but
-- readable/deletable by the whole household.
insert into storage.buckets (id, name, public)
values ('household-documents', 'household-documents', false)
on conflict (id) do nothing;

create policy "household-documents: household can read"
  on storage.objects for select
  using (
    bucket_id = 'household-documents'
    and (select p.household_owner_id from profiles p where p.id = (storage.foldername(name))[1]::uuid) = household_owner()
  );

create policy "household-documents: uploader can upload"
  on storage.objects for insert
  with check (bucket_id = 'household-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "household-documents: household can delete"
  on storage.objects for delete
  using (
    bucket_id = 'household-documents'
    and (select p.household_owner_id from profiles p where p.id = (storage.foldername(name))[1]::uuid) = household_owner()
  );
