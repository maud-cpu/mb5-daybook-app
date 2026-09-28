import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 6 of application-level encryption (see 0071_encrypt_diaries_handovers.sql).
// child_names stays plaintext -- it's the upsert conflict target and a
// name cache matched elsewhere, same carve-out as records.child/kids.
const ENC_FIELDS = ["sw_name", "comments", "achievements", "good", "worries", "views", "appointments", "family", "health"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("diaries").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const diaries = await lazyMigrateRows(supabase, "diaries", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ diaries });
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
    .from("diaries")
    .upsert(row, { onConflict: "household_owner_id,child_names,date_from,date_to" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
