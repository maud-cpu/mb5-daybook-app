import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 7 of application-level encryption (see 0072_encrypt_school_clubs_docs_reminders.sql).
// time_from/time_to stay plaintext -- structural, drive calendar occurrence
// grouping (lib/calendarHelpers.ts).
const ENC_FIELDS = ["club_name", "cost", "website", "contact_name", "contact_info", "notes"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("child_clubs").select("*").order("weekday");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clubs = await lazyMigrateRows(supabase, "child_clubs", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ clubs });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rows } = await req.json();
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "No rows given" }, { status: 400 });
  const inserts = rows.map((r) => encryptFieldsForWrite(r, ENC_FIELDS));
  const { data, error } = await supabase.from("child_clubs").insert(inserts).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: (data ?? []).map((d) => d.id) });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const update = encryptFieldsForWrite(patch, ENC_FIELDS);
  const { error } = await supabase.from("child_clubs").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = await supabase.from("child_clubs").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
