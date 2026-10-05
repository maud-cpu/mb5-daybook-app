import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";
import { sortChildren } from "@/lib/domain";

// Phase 3+4 of application-level encryption (see 0068_encrypt_children_identity.sql,
// 0069_encrypt_basics.sql). Plaintext name/family/hub_carer_*/surrey_contact/
// basics are kept dual-written -- records.child/kids, reminders.people,
// diaries.child_names and handover_plans.child_names all cache a child's
// name as text, and matching against those only keeps working because the
// plaintext mirror here stays byte-identical to what's encrypted.
const ENC_FIELDS = ["name", "family", "hub_carer_name", "hub_carer_phone", "hub_carer_email", "surrey_contact"];
const JSON_FIELDS = ["basics"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The Bin view (?bin=1) -- see the matching comment in /api/records.
  if (req.nextUrl.searchParams.get("bin") === "1") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("children").delete().lt("deleted_at", cutoff);
    const { data, error } = await supabase.from("children").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const children = await lazyMigrateRows(supabase, "children", "id", data ?? [], ENC_FIELDS, JSON_FIELDS);
    return NextResponse.json({ children });
  }

  const { data, error } = await supabase.from("children").select("*").is("deleted_at", null).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const children = await lazyMigrateRows(supabase, "children", "id", data ?? [], ENC_FIELDS, JSON_FIELDS);
  return NextResponse.json({ children: sortChildren(children) });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const insert = encryptFieldsForWrite(body, ENC_FIELDS, JSON_FIELDS);
  // Freshly-written plaintext columns already hold the exact values just
  // sent in -- no decrypt round-trip needed for the row just inserted, so
  // only the real (non-ciphertext) columns are selected back.
  const { data, error } = await supabase
    .from("children")
    .insert(insert)
    .select(
      "id, user_id, name, born, family, basics, created_at, category, lives_here, mockingbird, hub_carer_name, hub_carer_phone, hub_carer_email, surrey_contact, gender, placement_end_date, household_owner_id, linked_visitor_id, placement_category, csw_contact_id",
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ child: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, ids, patch } = await req.json();
  const update = encryptFieldsForWrite(patch, ENC_FIELDS, JSON_FIELDS);
  const query = supabase.from("children").update(update);
  const { error } = ids?.length ? await query.in("id", ids) : await query.eq("id", id);
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
  // "hard" is the Bin's own "delete forever" on a row that's already
  // soft-deleted -- a normal delete is soft (sets deleted_at), so it lands
  // in the Bin for 30 days. See 0086_recycle_bin.sql.
  const hard = req.nextUrl.searchParams.get("hard") === "1";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = hard
    ? await supabase.from("children").delete().eq("id", id).select()
    : await supabase.from("children").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
