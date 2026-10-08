import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// The household's own admin-maintained list of Mockingbird hub carers --
// see 0091_hub_directory.sql. Writing is restricted to the admin by RLS
// (shared_hub_directory: admin can write); every co-carer can still read
// it (needed so "Your Mockingbird" can offer the picker to anyone in the
// household, not just the admin), so a non-admin's POST/PATCH/DELETE here
// fails at the database with a row-level-security error, not silently.
const ENC_FIELDS = ["carer_name", "phone", "email"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("shared_hub_directory").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hubs = (await lazyMigrateRows(supabase, "shared_hub_directory", "id", data ?? [], ENC_FIELDS)).sort((a, b) =>
    (a.carer_name as string).localeCompare(b.carer_name as string),
  );
  return NextResponse.json({ hubs });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const insert = encryptFieldsForWrite(body, ENC_FIELDS);
  const { data, error } = await supabase.from("shared_hub_directory").insert(insert).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
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
  const { error } = await supabase.from("shared_hub_directory").update(update).eq("id", id);
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
  const { error, data } = await supabase.from("shared_hub_directory").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
