import { SupabaseClient } from "@supabase/supabase-js";
import { decryptField, encryptField } from "@/lib/crypto";

// Shared by every Phase-2-onward API route that has some fields ciphertext
// (in a `<field>_enc` column) and some still plaintext, mid-migration. See
// app/api/profile/route.ts for the original single-field version of this
// pattern -- this generalises it to a row with several such fields, keyed by
// whatever column that table's row is uniquely addressed by (an `id`, or
// `household_owner_id` for the household singleton).

/** Decrypts every field in `fields` off `row`, lazy-encrypting (and
 * persisting) any that are still plaintext-only -- no separate backfill
 * script needed. Returns a copy of `row` with the plaintext values in place
 * of both the `<field>` and `<field>_enc` columns. */
export async function lazyMigrateRow<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  matchColumn: string,
  row: T,
  fields: string[],
): Promise<T> {
  const out: Record<string, unknown> = { ...row };
  const updates: Record<string, string> = {};
  for (const f of fields) {
    const encVal = row[`${f}_enc`] as string | null | undefined;
    const plainVal = row[f] as string | null | undefined;
    if (!encVal && plainVal) {
      updates[`${f}_enc`] = encryptField(plainVal);
      out[f] = plainVal;
    } else {
      out[f] = decryptField(encVal);
    }
    delete out[`${f}_enc`];
  }
  if (Object.keys(updates).length) {
    await supabase.from(table).update(updates).eq(matchColumn, row[matchColumn]);
  }
  return out as T;
}

export async function lazyMigrateRows<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  matchColumn: string,
  rows: T[],
  fields: string[],
): Promise<T[]> {
  return Promise.all(rows.map((row) => lazyMigrateRow(supabase, table, matchColumn, row, fields)));
}

/** Builds a write payload from a partial patch: any key in `fields` gets
 * both its plaintext column (kept for not-yet-cut-over readers) and its
 * `_enc` column written together, so the two never fall out of step. Keys
 * not in `fields` pass through untouched. */
export function encryptFieldsForWrite<T extends Record<string, unknown>>(
  input: Partial<T>,
  fields: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (fields.includes(k)) {
      const plain = typeof v === "string" ? v : (v ?? "");
      out[k] = plain;
      out[`${k}_enc`] = encryptField(String(plain));
    } else {
      out[k] = v;
    }
  }
  return out;
}
