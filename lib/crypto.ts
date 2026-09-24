import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Application-level encryption for columns holding data about children and
// carers -- on top of (not instead of) Supabase's own disk-level encryption,
// so that even someone with raw database access (a leaked service-role key,
// or a breach of Supabase's own infrastructure) sees ciphertext, not plain
// text. The key never reaches the browser -- only server-side code (API
// routes, server components) ever calls encryptField/decryptField.
//
// Losing DATA_ENCRYPTION_KEY makes every field encrypted with it permanently
// unreadable -- there is no recovery path. Keep an offline backup copy of it
// somewhere separate from Vercel/GitHub.

const KEY_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

// Loaded once per server process, and only when first needed -- so routes
// that never touch encrypted fields don't fail to start over a missing key.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

export class DecryptionError extends Error {}

/** "" -> "" -- an unfilled field has nothing to protect, and treating blank
 * as a sentinel (rather than encrypting it) keeps "never filled in" visibly
 * different from a real decrypt failure, and avoids storing a ciphertext
 * blob for every field that's blank most of the time. */
export function encryptField(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${KEY_VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

export function decryptField(stored: string | null | undefined): string {
  if (!stored) return "";
  const sep = stored.indexOf(":");
  const version = sep === -1 ? "" : stored.slice(0, sep);
  if (version !== KEY_VERSION) {
    throw new DecryptionError(`Unrecognised encryption key version "${version}"`);
  }
  try {
    const packed = Buffer.from(stored.slice(sep + 1), "base64");
    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = packed.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (e) {
    // Never silently fall back to blank -- for safeguarding/health data, a
    // quietly-empty field is worse than a loud, visible error, since it
    // reads as "nothing recorded" rather than "couldn't be read".
    throw new DecryptionError(`Couldn't decrypt field: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

export function encryptJson<T>(value: T): string {
  return encryptField(JSON.stringify(value));
}

export function decryptJson<T>(stored: string | null | undefined, fallback: T): T {
  const text = decryptField(stored);
  if (!text) return fallback;
  return JSON.parse(text) as T;
}
