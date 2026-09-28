import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRow } from "@/lib/encryptedTable";

// Phase 2 of application-level encryption (see 0067_encrypt_household_contacts.sql).
// household holds the SSW/CSW/GP/hub-leader/emergency-duty-team contact
// details for the whole household -- genuinely identifying information
// about real professionals and arrangements around the children, so it
// moves behind a server route rather than being read/written straight from
// the browser's anon-key client.
const ENC_FIELDS = [
  "ssw_name",
  "ssw_phone",
  "ssw_email",
  "ssw_manager_name",
  "ssw_manager_phone",
  "ssw_manager_email",
  "csw",
  "gp",
  "hub",
  "school_contact",
  "delegated",
  "carseat",
  "hub_leader_name",
  "hub_leader_phone",
  "hub_leader_email",
  "edt",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("household").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ household: null });

  const household = await lazyMigrateRow(supabase, "household", "household_owner_id", data, ENC_FIELDS);
  return NextResponse.json({ household });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const patch = await req.json();
  const update = encryptFieldsForWrite(patch, ENC_FIELDS);
  const { error } = await supabase
    .from("household")
    .upsert({ ...update, updated_at: new Date().toISOString() }, { onConflict: "household_owner_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
