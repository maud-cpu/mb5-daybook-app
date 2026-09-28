import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 2 of application-level encryption (see 0067_encrypt_household_contacts.sql).
// Read-only -- nothing in the app currently inserts, updates or deletes a
// contacts row (confirmed by a full-repo search before writing this route).
// label stays plaintext -- a category ("GP", "Dentist"), not identifying.
const ENC_FIELDS = ["name", "phone", "email"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("contacts").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contacts = await lazyMigrateRows(supabase, "contacts", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ contacts });
}
