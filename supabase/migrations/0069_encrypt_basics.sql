-- 0069_encrypt_basics.sql
--
-- Phase 4 of application-level field encryption (see 0051, 0067, 0068).
-- children.basics and household_children.basics are jsonb "everything about
-- this child" profile forms (GP, allergies, NHS number, school, CSW,
-- teacher contacts, food likes/dislikes, bedtime routine, and more) -- too
-- many individually-sensitive sub-fields to encrypt one at a time, so the
-- whole object is encrypted as a single ciphertext blob (encryptJson/
-- decryptJson in lib/crypto.ts) rather than per-key.
--
-- Additive only, same dual-write pattern as every phase so far: the
-- plaintext jsonb column is kept in step, which is what lets every
-- server-only reader (app/api/ask, app/api/sort, etc.) keep reading it
-- directly with no changes.

alter table children
  add column if not exists basics_enc text;

alter table household_children
  add column if not exists basics_enc text;
