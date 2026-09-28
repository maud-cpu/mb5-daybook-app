import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 6 of application-level encryption (see 0071_encrypt_diaries_handovers.sql).
const ENC_FIELDS = [
  "about",
  "routine",
  "food",
  "school",
  "toilet",
  "sleep",
  "health",
  "emotions",
  "contact",
  "screens",
  "told",
  "nogo",
  "pack",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("handover_child_profiles").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const profiles = await lazyMigrateRows(supabase, "handover_child_profiles", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ profiles });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const row = encryptFieldsForWrite(body, ENC_FIELDS);
  const { error } = await supabase.from("handover_child_profiles").upsert(row, { onConflict: "household_owner_id,child_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
