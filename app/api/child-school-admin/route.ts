import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 7 of application-level encryption (see 0072_encrypt_school_clubs_docs_reminders.sql).
const ENC_FIELDS = [
  "lunch_payment",
  "homework_app_name",
  "homework_app_url",
  "homework_app_login",
  "class_rep_name",
  "class_rep_contact",
  "pta_name",
  "pta_contact",
  "pta_facebook",
  "school_office_contact",
  "other_links",
  "notes",
  "teacher_name",
  "teacher_contact",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("child_school_admin").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await lazyMigrateRows(supabase, "child_school_admin", "child_id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const row = encryptFieldsForWrite(body, ENC_FIELDS);
  const { error } = await supabase.from("child_school_admin").upsert(row, { onConflict: "child_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
