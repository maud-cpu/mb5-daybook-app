-- 0051_encrypt_display_name.sql
--
-- Phase 1 of application-level encryption for children/carer data (social
-- services requires this, on top of Supabase's own disk-level encryption).
-- This is the pilot slice -- the smallest possible field -- to prove the
-- whole pattern (ciphertext column -> server route -> component cutover)
-- before it's scaled up to the much larger and more sensitive tables.
--
-- display_name_enc holds AES-256-GCM ciphertext produced by lib/crypto.ts,
-- written by app/api/profile/route.ts. The plain display_name column is
-- left in place for now (existing server-side reads in
-- app/admin/shared-entries/page.tsx and the admin_carer_overview RPC keep
-- working unmodified) and will be dropped in a later cleanup migration once
-- every reader has moved to the encrypted column.

alter table profiles add column display_name_enc text;
