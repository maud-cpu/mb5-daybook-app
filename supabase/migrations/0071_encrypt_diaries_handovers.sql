-- 0071_encrypt_diaries_handovers.sql
--
-- Phase 6 of application-level field encryption (see 0051, 0067, 0068, 0069,
-- 0070). Encrypts the statutory diary and handover/sleepover documents.
--
-- Additive only, same dual-write pattern as every phase so far.
--
-- child_names (on diaries and handover_plans) stays unencrypted on purpose:
-- it's a plaintext child-name cache, part of both tables' unique
-- constraints/upsert conflict targets, and matched with .eq("child_names",
-- …) in application code -- same carve-out already applied to
-- records.child/kids and reminders.people.
--
-- handovers (a singleton-per-household row, like household) is NOT touched
-- here: confirmed via a full repo search that nothing reads or writes it
-- anywhere in the app today -- it's dead code with no live data to
-- protect. Revisit if it's ever wired up.

alter table diaries
  add column if not exists sw_name_enc text,
  add column if not exists comments_enc text,
  add column if not exists achievements_enc text,
  add column if not exists good_enc text,
  add column if not exists worries_enc text,
  add column if not exists views_enc text,
  add column if not exists appointments_enc text,
  add column if not exists family_enc text,
  add column if not exists health_enc text;

alter table handover_plans
  add column if not exists receiving_carer_enc text,
  add column if not exists this_stay_enc text,
  add column if not exists return_notes_enc text;

alter table handover_child_profiles
  add column if not exists about_enc text,
  add column if not exists routine_enc text,
  add column if not exists food_enc text,
  add column if not exists school_enc text,
  add column if not exists toilet_enc text,
  add column if not exists sleep_enc text,
  add column if not exists health_enc text,
  add column if not exists emotions_enc text,
  add column if not exists contact_enc text,
  add column if not exists screens_enc text,
  add column if not exists told_enc text,
  add column if not exists nogo_enc text,
  add column if not exists pack_enc text;
