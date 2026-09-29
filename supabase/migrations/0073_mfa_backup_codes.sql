-- 0073_mfa_backup_codes.sql
--
-- One-time backup codes for two-factor authentication (see lib/mfa.ts,
-- app/login/page.tsx, components/TwoFactorCard.tsx). The TOTP factor itself
-- lives entirely in Supabase's own auth.mfa_factors table via the built-in
-- auth.mfa.* API -- this table only holds the backup codes, which Supabase
-- has no native concept of.
--
-- Each carer manages their own 2FA independently -- even co-carers sharing
-- a household log in with separate accounts -- so this is scoped by
-- user_id like an ordinary personal-account table, not household-shared
-- like most other tables in this app.
--
-- Only a salted-by-randomness hash of each code is ever stored; the
-- plaintext codes are shown to the carer once, at generation time, and
-- never again. bypass_token/bypass_expires_at are set when a code is
-- redeemed at login (in place of a TOTP check) -- see mfaSatisfied() in
-- lib/mfa.ts for how that's checked on every request.
create table mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  code_hash text not null,
  used_at timestamptz,
  bypass_token text,
  bypass_expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table mfa_backup_codes enable row level security;

create policy "mfa_backup_codes: owner only" on mfa_backup_codes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
