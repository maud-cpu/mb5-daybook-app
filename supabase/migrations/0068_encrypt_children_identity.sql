-- 0068_encrypt_children_identity.sql
--
-- Phase 3 of application-level field encryption (see 0051, 0067). Adds
-- ciphertext columns for the identity/contact text fields on children and
-- household_children -- their name, the family/household they visit from,
-- their Mockingbird hub carer's contact details, their Surrey contact, and
-- (household_children only) free-text notes.
--
-- Additive only, same as every phase so far: plaintext columns are kept in
-- step (dual-written) by the new API routes. This matters more here than in
-- earlier phases -- records.child/kids, reminders.people, diaries.child_names
-- and handover_plans.child_names all cache a child's name as plain text, and
-- keeping the plaintext `name` column byte-identical to what's encrypted
-- means every one of those existing name-matches keeps working untouched.
--
-- Left unencrypted on purpose: born/category/gender/mockingbird/lives_here/
-- placement_end_date/linked_visitor_id (dates, enums, ids -- not
-- independently identifying, several need to stay SQL-filterable), and
-- basics/jsonb (Phase 4).

alter table children
  add column if not exists name_enc text,
  add column if not exists family_enc text,
  add column if not exists hub_carer_name_enc text,
  add column if not exists hub_carer_phone_enc text,
  add column if not exists hub_carer_email_enc text,
  add column if not exists surrey_contact_enc text;

alter table household_children
  add column if not exists name_enc text,
  add column if not exists hub_carer_name_enc text,
  add column if not exists hub_carer_phone_enc text,
  add column if not exists hub_carer_email_enc text,
  add column if not exists surrey_contact_enc text,
  add column if not exists notes_enc text;
