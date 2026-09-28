-- 0070_encrypt_records.sql
--
-- Phase 5 of application-level field encryption (see 0051, 0067, 0068, 0069).
-- records is the core diary/incident/meds/expenses log -- the single
-- most-used table in the app. Encrypts every genuinely identifying or
-- narrative free-text field: the entry text itself, the flag/training
-- explanatory notes, medication name/dose/giver, the expense reason, and
-- which child(ren) the entry is about (child/kids) -- knowing WHICH child an
-- incident or medication entry is about is itself sensitive, even before
-- reading the entry's own text.
--
-- kids is a text[] (a child may have more than one name tagged on an
-- entry) -- encrypted as one whole-array ciphertext blob (kids_enc), same
-- approach as children.basics' whole-object encryption, since nothing
-- filters on it at the SQL level (every match against it is done in
-- application code after fetching the row).
--
-- Additive only, same dual-write pattern as every phase so far.
--
-- Left unencrypted on purpose: bucket/kind/flag/also_in (enum-like,
-- SQL-filtered), date/created_at/edited/reported/claimed_at/paid_at/
-- flag_done_at (dates, SQL-filtered), done/flag_done/flag_cleared/
-- flag_dismissed/overnight/shared_with_admin/claimed/paid (booleans,
-- SQL-filtered), amount/miles/hours (numbers), time_from/time_to/given
-- (times), photos (file paths, not narrative text), and all id/ownership
-- columns.

alter table records
  add column if not exists text_enc text,
  add column if not exists flag_note_enc text,
  add column if not exists training_note_enc text,
  add column if not exists med_name_enc text,
  add column if not exists dose_enc text,
  add column if not exists given_by_enc text,
  add column if not exists reason_enc text,
  add column if not exists child_enc text,
  add column if not exists kids_enc text;
