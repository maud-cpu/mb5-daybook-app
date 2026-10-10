-- Every uploaded document (0047) sits in storage with just a title/category
-- for reference -- there was no way to see what's actually IN a document
-- without opening it, and "How's life" could only ever re-read raw files
-- live at request time, which doesn't scale to someone uploading years of
-- diaries (a document cap exists on that route specifically because of this).
--
-- summary_enc holds a short, one-time AI-written summary of a single
-- document, written once (at upload, or via a backfill "Summarize" button
-- for documents already on file) rather than regenerated on every read.
-- There's deliberately no plaintext companion column -- unlike
-- title/category/file_name (0072), which migrated forward from data that
-- already existed in plaintext, summary_enc only ever gets written by new
-- code, so it can be encrypted-only from day one. lazyMigrateRow (see
-- lib/encryptedTable.ts) still handles it correctly: a row with no
-- summary_enc yet just decrypts to "", never attempts to write a
-- nonexistent plaintext "summary" column back.
alter table child_documents add column summary_enc text;
alter table child_documents add column summarized_at timestamptz;

-- The cached "this child, so far" overview -- regenerated from every one of
-- a child's (short) document summaries, never from the raw files themselves,
-- so it stays cheap and fast no matter how many years of documents pile up.
-- One row per child; child_id is NOT FK-restricted to "children", same
-- reasoning as child_documents itself (0047) -- a household_children row
-- needs this exactly the same way.
create table child_life_summary (
  child_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  summary_enc text not null default '',
  doc_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table child_life_summary enable row level security;

create policy "child_life_summary: owner only"
  on child_life_summary for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
