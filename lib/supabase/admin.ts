import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only client using the secret/service-role key. Never import this
 * from a Client Component or anything bundled for the browser -- it can
 * bypass Row Level Security entirely, which is exactly why it's only used
 * for admin actions like creating a carer's account.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
