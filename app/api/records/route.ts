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
  const keepLinked = req.nextUrl.searchParams.get("keepLinked") === "1";
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : id ? [id] : [];
  if (!ids.length) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = await supabase.from("records").delete().in("id", ids).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  // A record deleted from Entries/Expenses shouldn't leave a stale calendar
  // reminder still pointing at it -- delete the reminder alongside it, the
  // same as deleting from the calendar already removes the record (see
  // CalendarScreen/MiniCalendarCard's deleteOne/deleteEditing). record_id
  // only ever covers a reminder cleanly linked to one record; record_ids
  // (0085) also catches one that merged several daycare sessions into a
  // single reminder, where record_id itself falls back to null.
  if (keepLinked) {
    // The carer chose to keep the calendar reminder even though the record
    // it was logged from is gone -- strip the now-dangling link rather than
    // deleting the reminder, so it stays on the calendar unattached.
    const [{ data: byRecordId }, { data: byRecordIds }] = await Promise.all([
      supabase.from("reminders").select("id, record_id, record_ids").in("record_id", ids),
      supabase.from("reminders").select("id, record_id, record_ids").overlaps("record_ids", ids),
    ]);
    const linked = new Map<string, { id: string; record_id: string | null; record_ids: string[] | null }>();
    for (const r of [...(byRecordId ?? []), ...(byRecordIds ?? [])]) linked.set(r.id, r);
    for (const rem of linked.values()) {
      const patch: { record_id?: null; record_ids?: string[] } = {};
      if (rem.record_id && ids.includes(rem.record_id)) patch.record_id = null;
      if (rem.record_ids?.some((x) => ids.includes(x))) patch.record_ids = rem.record_ids.filter((x) => !ids.includes(x));
      if (Object.keys(patch).length) await supabase.from("reminders").update(patch).eq("id", rem.id);
    }
  } else {
    await supabase.from("reminders").delete().in("record_id", ids);
    await supabase.from("reminders").delete().overlaps("record_ids", ids);
  }
  return NextResponse.json({ ok: true });
}
