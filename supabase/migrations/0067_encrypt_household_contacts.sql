-- 0067_encrypt_household_contacts.sql
--
-- Phase 2 of application-level field encryption (see 0051 for the pilot on
-- profiles.display_name). Adds ciphertext columns for every genuinely
-- identifying/contact text field on household, household_adults,
-- household_visitors and contacts. Additive only -- the plaintext columns
-- are kept in place and dual-written by the new API routes until every
-- reader has been cut over and verified, exactly like the 0051 pattern.
--
-- Left unencrypted on purpose: role/gender/label (enum-like categories, not
-- independently identifying), is_mockingbird/ssw_start (need to stay
-- filterable), linked_visitor_id/user_id/household_owner_id/id/created_at/
-- updated_at (ids, dates, flags), and household.adults (legacy/unused jsonb
-- column, superseded by the household_adults table).

alter table household
  add column if not exists ssw_name_enc text,
  add column if not exists ssw_phone_enc text,
  add column if not exists ssw_email_enc text,
  add column if not exists ssw_manager_name_enc text,
  add column if not exists ssw_manager_phone_enc text,
  add column if not exists ssw_manager_email_enc text,
  add column if not exists csw_enc text,
  add column if not exists gp_enc text,
  add column if not exists hub_enc text,
  add column if not exists school_contact_enc text,
  add column if not exists delegated_enc text,
  add column if not exists carseat_enc text,
  add column if not exists hub_leader_name_enc text,
  add column if not exists hub_leader_phone_enc text,
  add column if not exists hub_leader_email_enc text,
  add column if not exists edt_enc text;

alter table household_adults
  add column if not exists name_enc text,
  add column if not exists phone_enc text,
  add column if not exists email_enc text;

alter table household_visitors
  add column if not exists name_enc text,
  add column if not exists phone_enc text,
  add column if not exists email_enc text;

alter table contacts
  add column if not exists name_enc text,
  add column if not exists phone_enc text,
  add column if not exists email_enc text;
