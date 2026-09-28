import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 3 of application-level encryption (see 0068_encrypt_children_identity.sql).
// Plaintext name/family/hub_carer_*/surrey_contact are kept dual-written --
// records.child/kids, reminders.people, diaries.child_names and
// handover_plans.child_names all cache a child's name as text, and matching
// against those only keeps working because the plaintext mirror here stays
// byte-identical to what's encrypted. basics (jsonb) stays untouched
// (Phase 4) -- callers still read/write it straight from the browser.
const ENC_FIELDS = ["name", "family", "hub_carer_name", "hub_carer_phone", "hub_carer_email", "surrey_contact"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("children").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const children = await lazyMigrateRows(supabase, "children", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ children });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const insert = encryptFieldsForWrite(body, ENC_FIELDS);
  // Freshly-written plaintext columns already hold the exact values just
  // sent in -- no decrypt round-trip needed for the row just inserted, so
  // only the real (non-ciphertext) columns are selected back.
  const { data, error } = await supabase
    .from("children")
    .insert(insert)
    .select(
      "id, user_id, name, born, family, basics, created_at, category, lives_here, mockingbird, hub_carer_name, hub_carer_phone, hub_carer_email, surrey_contact, gender, placement_end_date, household_owner_id, linked_visitor_id",
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
  const update = encryptFieldsForWrite(patch, ENC_FIELDS);
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
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = await supabase.from("children").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
