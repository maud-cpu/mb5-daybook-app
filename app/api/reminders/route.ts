import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 7 of application-level encryption (see 0072_encrypt_school_clubs_docs_reminders.sql).
// people stays plaintext -- a name-cache array, the same carve-out already
// applied to records.kids/diaries.child_names. category/child/source_key
// are enum-like/id/deprecated -- also left plain.
const ENC_FIELDS = ["text", "source_text"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("reminders").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = await lazyMigrateRows(supabase, "reminders", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ reminders });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rows, onConflict } = await req.json();
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "No rows given" }, { status: 400 });
  const inserts = rows.map((r) => encryptFieldsForWrite(r, ENC_FIELDS));
  const { error } = onConflict
    ? await supabase.from("reminders").upsert(inserts, { onConflict })
    : await supabase.from("reminders").insert(inserts);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
  const { error } = await supabase.from("reminders").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const id = params.get("id");
  const idsParam = params.get("ids");
  const sourceKey = params.get("sourceKey");
  const seriesId = params.get("seriesId");

  // A delete whose WHERE clause (or RLS policy) matches nothing isn't an
  // error as far as Postgres is concerned -- it just affects 0 rows, and
  // the old code here returned { ok: true } regardless, so a delete that
  // silently matched nothing (e.g. a household_owner_id mismatch) looked
  // identical to a real success and the "deleted" row just reappeared on
  // the next reload with no explanation why. Selecting the deleted ids
  // back lets a single-id delete tell the two cases apart and say so.
  let query = supabase.from("reminders").delete().select("id");
  if (idsParam) query = query.in("id", idsParam.split(",").filter(Boolean));
  else if (id) query = query.eq("id", id);
  else if (sourceKey) query = query.eq("source_key", sourceKey);
  else if (seriesId) query = query.eq("series_id", seriesId);
  else return NextResponse.json({ error: "Missing id, ids, sourceKey or seriesId" }, { status: 400 });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (id && !data?.length) {
    return NextResponse.json(
      { error: "Nothing was deleted — it may already be gone, or you may not have permission to remove it." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
