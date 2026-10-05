import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client for the SEPARATE Supabase project used purely as an
 * off-platform backup target for Storage objects (child documents, entry
 * photos, household documents) -- Supabase's own daily database backups
 * (see Database > Backups in the dashboard) explicitly exclude Storage, so
 * this exists to cover that gap with a copy that survives even a billing
 * problem or suspension on the main project, since it lives in a wholly
 * separate Supabase account/project. Never import from a Client Component.
 */
export function createBackupClient() {
  return createSupabaseClient(process.env.BACKUP_SUPABASE_URL!, process.env.BACKUP_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
