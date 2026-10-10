import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptFieldsForWrite, lazyMigrateRows } from "@/lib/encryptedTable";

// Phase 7 of application-level encryption (see 0072_encrypt_school_clubs_docs_reminders.sql).
// file_path stays plaintext -- the Storage object key, needed verbatim to
// open/delete the actual file. The file's own bytes in the "child-documents"
// bucket are out of scope for this plan -- only this row's metadata.
// "summary" has no plaintext companion column (see 0097) -- lazyMigrateRows
// still handles it correctly: a row with no summary_enc yet just decrypts
// to "" and never attempts to write back a plaintext "summary" column that
// doesn't exist.
const ENC_FIELDS = ["title", "category", "file_name", "summary"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("child_documents").select("*").order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documents = await lazyMigrateRows(supabase, "child_documents", "id", data ?? [], ENC_FIELDS);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const insert = encryptFieldsForWrite(body, ENC_FIELDS);
  const { data, error } = await supabase.from("child_documents").insert(insert).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error, data } = await supabase.from("child_documents").delete().eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Nothing removed" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
