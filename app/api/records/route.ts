import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 5 of application-level encryption (see 0070_encrypt_records.sql).
// records is the core diary/incident/meds/expenses log. Plaintext columns
// are kept dual-written -- every existing name-match against child/kids
// (diary drafts, handover drafts, "children in this entry" filters) and
// every server-only reader keeps working unchanged, same reasoning as
// every phase so far.
const ENC_FIELDS = ["text", "flag_note", "training_note", "med_name", "dose", "given_by", "reason", "child"];
const JSON_FIELDS = ["kids"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("records").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const records = await lazyMigrateRows(supabase, "records", "id", data ?? [], ENC_FIELDS, JSON_FIELDS);
  return NextResponse.json({ records });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rows } = await req.json();
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "No rows given" }, { status: 400 });
  const inserts = rows.map((r) => encryptFieldsForWrite(r, ENC_FIELDS, JSON_FIELDS));
  const { data, error } = await supabase.from("records").insert(inserts).select("id");
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
  const update = encryptFieldsForWrite(patch, ENC_FIELDS, JSON_FIELDS);
  const { error } = await supabase.from("records").update(update).eq("id", id);
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
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : id ? [id] : [];
  if (!ids.length) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = await supabase.from("records").delete().in("id", ids).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  // A record deleted from Entries/Expenses shouldn't leave a stale calendar
  // reminder still pointing at it -- delete the reminder alongside it, the
  // same as deleting from the calendar already removes the record (see
  // CalendarScreen/MiniCalendarCard's deleteOne/deleteEditing).
  await supabase.from("reminders").delete().in("record_id", ids);
  return NextResponse.json({ ok: true });
}
