-- 0047_child_documents.sql
--
-- A per-child document library -- old diaries, previous placement's
-- handover notes, meeting minutes, assessments, reports -- kept alongside
-- the child's other records for three reasons: reference while caring for
-- them, a ready-made pack to pass on if the placement ends, and giving a
-- fuller picture of a child's history and needs than any single entry can.
-- child_id is deliberately not FK-restricted to the "children" table --
-- same reasoning as child_school_admin/child_clubs (0032) -- so a child
-- recorded under "Children in your household" gets exactly the same
-- document library.

create table child_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  child_id uuid not null,
  title text not null default '',
  category text not null default '',
  file_path text not null,
  file_name text not null default '',
  uploaded_at timestamptz not null default now()
);

alter table child_documents enable row level security;

create policy "child_documents: owner only"
  on child_documents for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Same private-bucket, owner-folder pattern as entry-photos (0004): one
-- folder per carer (path: <user_id>/<filename>), only the owning carer can
-- read/write their own folder. Any file type is allowed here (PDFs, Word
-- documents, scanned images), unlike entry-photos which only ever holds
-- resized JPEGs.
insert into storage.buckets (id, name, public)
values ('child-documents', 'child-documents', false)
on conflict (id) do nothing;

create policy "child-documents: owner can read"
  on storage.objects for select
  using (bucket_id = 'child-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "child-documents: owner can upload"
  on storage.objects for insert
  with check (bucket_id = 'child-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "child-documents: owner can delete"
  on storage.objects for delete
  using (bucket_id = 'child-documents' and (storage.foldername(name))[1] = auth.uid()::text);
