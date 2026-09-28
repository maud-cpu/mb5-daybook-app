# Application-level encryption

Every field listed below is encrypted at rest with AES-256-GCM (`lib/crypto.ts`), on top of Supabase's own disk-level encryption. This protects against someone with raw database access (a leaked service-role key, or a breach of Supabase's own infrastructure) — it does not protect against a compromise of the app/Vercel deployment itself, which needs the key to run.

## Current state: dual-write, plaintext not yet dropped

Every phase below is additive: each encrypted field has a matching `<field>_enc` column, and the app writes both the plaintext column and the `_enc` column on every insert/update. The plaintext column is **not yet dropped** from any table.

This is deliberate, not an oversight — dropping needs its own careful pass (see "What's left" below), and until then:
- The confidentiality benefit isn't fully realised yet: the plaintext column still holds real data, so a raw DB dump still shows it. The `_enc` columns exist and are correctly populated, ready for that final cutover.
- The one exception is `profiles.display_name` (Phase 1), which was the pilot — its plaintext column is also still present but this was the proof-of-pattern slice, not the finished state either.
- Every browser (`"use client"`) read or write of an encrypted table goes through a server API route, never the table directly — confirmed by a full repo audit (see "Audit" below). Several server-only files (`/api/ask`, `/api/sort`, `/api/extract-events`, `/api/draft-diary`, `/api/draft-handover`, `/api/compose-email`, `/api/cla-summary`, `/api/rescan`, `app/admin/shared-entries/page.tsx`) still read the plaintext columns directly — this is safe and intentional, since they run server-side only and the plaintext stays byte-identical to what's encrypted.

## What's encrypted, by phase

| Phase | Table | Encrypted fields | Left plain, and why |
|---|---|---|---|
| 1 | `profiles` | `display_name` | — |
| 2 | `household` | `ssw_name`, `ssw_phone`, `ssw_email`, `ssw_manager_name`, `ssw_manager_phone`, `ssw_manager_email`, `csw`, `gp`, `hub`, `school_contact`, `delegated`, `carseat`, `hub_leader_name`, `hub_leader_phone`, `hub_leader_email`, `edt` | `is_mockingbird`, `ssw_start`, `adults` (legacy/unused jsonb) |
| 2 | `household_adults` | `name`, `phone`, `email` | `role`, `gender` (category, not identifying) |
| 2 | `household_visitors` | `name`, `phone`, `email` | `role`, `gender`, `linked_visitor_id` |
| 2 | `contacts` | `name`, `phone`, `email` | `label` (category) |
| 3 | `children` | `name`, `family`, `hub_carer_name`, `hub_carer_phone`, `hub_carer_email`, `surrey_contact` | `born`, `category`, `gender`, `mockingbird`, `lives_here`, `placement_end_date`, `linked_visitor_id` |
| 3 | `household_children` | `name`, `hub_carer_name`, `hub_carer_phone`, `hub_carer_email`, `surrey_contact`, `notes` | `born`, `category`, `gender`, `mockingbird` |
| 4 | `children.basics`, `household_children.basics` | whole jsonb object, one ciphertext blob (`basics_enc`) | — |
| 5 | `records` | `text`, `flag_note`, `training_note`, `med_name`, `dose`, `given_by`, `reason`, `child`, `kids` (whole-array blob) | `bucket`, `flag`, `also_in`, dates, booleans, numbers, `photos` |
| 6 | `diaries` | `sw_name`, `comments`, `achievements`, `good`, `worries`, `views`, `appointments`, `family`, `health` | `child_names` (name cache — see below) |
| 6 | `handover_plans` | `receiving_carer`, `this_stay`, `return_notes` | `child_names` |
| 6 | `handover_child_profiles` | `about`, `routine`, `food`, `school`, `toilet`, `sleep`, `health`, `emotions`, `contact`, `screens`, `told`, `nogo`, `pack` | `child_id` (id, not name) |
| 7 | `child_school_admin` | all 13 fields (`lunch_payment`, `homework_app_name`, `homework_app_url`, `homework_app_login`, `class_rep_name`, `class_rep_contact`, `pta_name`, `pta_contact`, `pta_facebook`, `school_office_contact`, `other_links`, `notes`, `teacher_name`, `teacher_contact`) | — |
| 7 | `child_clubs` | `club_name`, `cost`, `website`, `contact_name`, `contact_info`, `notes` | `time_from`, `time_to` (structural — drive calendar grouping) |
| 7 | `child_documents` | `title`, `category`, `file_name` | `file_path` (Storage object key) — **the actual uploaded file content in the `child-documents` Storage bucket is out of scope for this plan entirely** |
| 7 | `reminders` | `text`, `source_text` | `people` (name cache), `category`, `child` (deprecated/unused), `done`, `date`, etc. |

**Not touched by any phase**: `handovers` (a singleton-per-household row like `household`) — confirmed nothing in the app reads or writes it; revisit if it's ever wired up.

**Name-cache columns, left unencrypted everywhere on purpose**: `records.child`/`kids`, `reminders.people`, `diaries.child_names`, `handover_plans.child_names`. These are plaintext copies of a child's name used for matching/filtering across the app (diary drafts, handover drafts, calendar filters, upsert conflict targets). They stay accurate only because the *source* columns (`children.name`, `household_children.name`) are dual-written — if those plaintext mirrors are ever dropped, every one of these caches needs the same id-based rework the original plan flagged for Phase 3 before it can happen.

## Audit (confirms the above)

A full repo grep for every encrypted table, restricted to `"use client"` files, found exactly one direct `.from(...)` call outside the new API routes: `AboutScreen.tsx`'s `promoteFamilyToVisitor`, which only ever updates `children.linked_visitor_id` (a plain uuid, not an encrypted field). Everything else goes through `/api/household`, `/api/household-adults`, `/api/household-visitors`, `/api/contacts`, `/api/children`, `/api/household-children`, `/api/records`, `/api/diaries`, `/api/handover-plans`, `/api/handover-child-profiles`, `/api/child-school-admin`, `/api/child-clubs`, `/api/child-documents`, or `/api/reminders`.

## Key management

- `DATA_ENCRYPTION_KEY`: base64-encoded 32 bytes, loaded once per server process (`lib/crypto.ts`). Set in Vercel's production environment (confirmed live since 24/09) and in `.env.local` for local dev.
- **Losing this key makes every encrypted field permanently unrecoverable.** Keep an offline backup (paper or a USB stick, kept somewhere separate from any device with GitHub/Vercel access) — confirmed done.
- The key is versioned: every ciphertext is stored as `v1:<base64 of iv‖authTag‖ciphertext>`. The `v1:` prefix exists specifically so a future key can be introduced as `v2` without needing to touch already-encrypted rows immediately.

## Key rotation procedure (if the key is ever suspected compromised, or as routine hygiene)

The current code (`lib/crypto.ts`) only ever loads one key from `DATA_ENCRYPTION_KEY` and only recognises the `v1:` prefix — there is no live support for two keys active at once. Rotating therefore needs a one-off offline script, not just an env var swap:

1. Generate a new 32-byte key, base64-encode it, and get it into a safe offline backup immediately (same rule as the original key).
2. Write a one-off Node script (not committed — same convention as every other verification script this session has used) that, for every table/column listed above:
   - reads every row's plaintext column and its own `_enc` column,
   - decrypts `_enc` with the **old** key to confirm it matches the plaintext (sanity check),
   - re-encrypts the plaintext with the **new** key,
   - writes the new ciphertext back to the same `_enc` column.
   - This has to run with **both keys available to the script** (e.g. as two separate env vars passed only to that script's process, never both live in the actual app at once).
3. Once every row is confirmed re-encrypted and spot-checked, update `DATA_ENCRYPTION_KEY` in Vercel to the new key and redeploy.
4. Securely destroy the old key (shred the paper copy / wipe the USB backup) only after confirming the app works end-to-end against the new key in production.
5. Never do this against live data without a fresh Supabase backup taken immediately beforehand.

This is a genuinely risky, all-or-nothing operation against real safeguarding data — worth treating as its own planned piece of work when it's actually needed, not something to script casually in the moment.

## What's left (not done in this pass)

1. **Dropping the plaintext columns.** This is the step that actually delivers the "even raw DB access shows ciphertext" promise. It should wait until:
   - the app has been used normally, across every feature touched by phases 1-7, for a real stretch of time (a few weeks is a reasonable bar) with no data-loss or decrypt-error reports, and
   - the name-cache columns (`records.child/kids`, `reminders.people`, `diaries.child_names`, `handover_plans.child_names`) are either accepted as a permanent plaintext exception, or reworked to be id-based first (the harder path, deferred from Phase 3 originally).
   - Dropping is per-column and irreversible — once a plaintext column is gone, the only copy of that data is the ciphertext, decryptable only with the current key.
2. **Key rotation** has a documented procedure above but has not been exercised — worth a dry run against a throwaway Supabase project before ever needing it for real.
3. **`handovers`** table — currently untouched (dead code). If it's ever wired up to an actual feature, it needs the same treatment as `household` (a `content_enc` column, dual-write, decrypt-on-read).
