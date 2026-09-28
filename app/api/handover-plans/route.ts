import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 6 of application-level encryption (see 0071_encrypt_diaries_handovers.sql).
// child_names stays plaintext -- same carve-out as diaries.child_names.
const ENC_FIELDS = ["receiving_carer", "this_stay", "return_notes"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("handover_plans").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plans = await lazyMigrateRows(supabase, "handover_plans", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const row = encryptFieldsForWrite(body, ENC_FIELDS);
  const { error } = await supabase
    .from("handover_plans")
    .upsert(row, { onConflict: "household_owner_id,child_names,date_from,date_to" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
