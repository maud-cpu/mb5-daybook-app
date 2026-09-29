import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Two-factor auth is opt-in per carer (see TwoFactorCard.tsx) and uses
// Supabase Auth's own TOTP support for the actual factor -- this file only
// covers the backup-code fallback, which Supabase has no built-in concept
// of, plus the shared check for whether the current session has satisfied
// MFA at all (used by both middleware and requireUser()).

export const MFA_BYPASS_COOKIE = "mfa_bypass";

// Excludes 0/O/1/I/L -- easy to misread when copied onto paper.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_COUNT = 10;
// A backup-code login doesn't get Supabase's own aal2 (only a real TOTP
// verify does that) -- this bypass window stands in for it instead, bounded
// so a stale one can't grant access indefinitely.
const BYPASS_TTL_MS = 12 * 60 * 60 * 1000;

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function generateBackupCodes(): string[] {
  return Array.from({ length: CODE_COUNT }, randomCode);
}

export function normaliseBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(normaliseBackupCode(code)).digest("hex");
}

export function newBypassToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function bypassExpiry(): string {
  return new Date(Date.now() + BYPASS_TTL_MS).toISOString();
}

type CookieReader = { get(name: string): { value: string } | undefined };

/**
 * Whether the current session has satisfied MFA: either the carer has no
 * enrolled factor at all (2FA is opt-in, so aal1===aal1 for most accounts),
 * Supabase's own aal2 (a real TOTP verify happened this session), or a
 * still-valid backup-code bypass set earlier in this same browser session.
 */
export async function mfaSatisfied(supabase: SupabaseClient, cookies: CookieReader): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data || data.currentLevel === data.nextLevel) return true;

  const token = cookies.get(MFA_BYPASS_COOKIE)?.value;
  if (!token) return false;

  const { data: row } = await supabase
    .from("mfa_backup_codes")
    .select("bypass_expires_at")
    .eq("bypass_token", token)
    .not("used_at", "is", null)
    .maybeSingle();
  if (!row?.bypass_expires_at) return false;
  return new Date(row.bypass_expires_at).getTime() > Date.now();
}
