import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 3 of application-level encryption (see 0068_encrypt_children_identity.sql).
// Same dual-write reasoning as /api/children -- basics (jsonb) stays
// untouched (Phase 4).
const ENC_FIELDS = ["name", "hub_carer_name", "hub_carer_phone", "hub_carer_email", "surrey_contact", "notes"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("household_children").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const children = await lazyMigrateRows(supabase, "household_children", "id", data ?? [], ENC_FIELDS);
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
  const { data, error } = await supabase
    .from("household_children")
    .insert(insert)
    .select(
      "id, user_id, name, born, notes, created_at, category, basics, mockingbird, hub_carer_name, hub_carer_phone, hub_carer_email, surrey_contact, gender, household_owner_id",
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

  const { id, patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const update = encryptFieldsForWrite(patch, ENC_FIELDS);
  const { error } = await supabase.from("household_children").update(update).eq("id", id);
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
  const { error, data } = await supabase.from("household_children").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
