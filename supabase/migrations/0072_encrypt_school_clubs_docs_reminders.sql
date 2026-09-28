-- 0072_encrypt_school_clubs_docs_reminders.sql
--
-- Phase 7 of application-level field encryption (see 0051, 0067-0071).
-- Encrypts School admin, Clubs, document metadata (not file content in
-- Storage -- explicitly out of scope), and calendar/reminder text.
--
-- Additive only, same dual-write pattern as every phase so far.
--
-- reminders.people stays plaintext on purpose -- a name-cache array, the
-- same established carve-out as records.kids/diaries.child_names (see
-- 0070/0071's comments). reminders.category/child are enum-like/deprecated,
-- child_clubs.time_from/time_to are structural (drive calendar occurrence
-- grouping), and child_documents.file_path is the Storage object key
-- (needed verbatim to open/delete the file) -- none of these are encrypted.

alter table child_school_admin
  add column if not exists lunch_payment_enc text,
  add column if not exists homework_app_name_enc text,
  add column if not exists homework_app_url_enc text,
  add column if not exists homework_app_login_enc text,
  add column if not exists class_rep_name_enc text,
  add column if not exists class_rep_contact_enc text,
  add column if not exists pta_name_enc text,
  add column if not exists pta_contact_enc text,
  add column if not exists pta_facebook_enc text,
  add column if not exists school_office_contact_enc text,
  add column if not exists other_links_enc text,
  add column if not exists notes_enc text,
  add column if not exists teacher_name_enc text,
  add column if not exists teacher_contact_enc text;

alter table child_clubs
  add column if not exists club_name_enc text,
  add column if not exists cost_enc text,
  add column if not exists website_enc text,
  add column if not exists contact_name_enc text,
  add column if not exists contact_info_enc text,
  add column if not exists notes_enc text;

alter table child_documents
  add column if not exists title_enc text,
  add column if not exists category_enc text,
  add column if not exists file_name_enc text;

alter table reminders
  add column if not exists text_enc text,
  add column if not exists source_text_enc text;
