import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptField, encryptField } from "@/lib/crypto";

// Pilot slice for application-level encryption (see supabase/migrations/
// 0051_encrypt_display_name.sql). display_name never reaches the browser
// as anything other than plaintext-over-HTTPS to its own owner -- the
// point is that it's ciphertext at rest in the database, not that the
// browser can't ever see its own name.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, display_name_enc")
    .eq("id", user.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lazy-migrate: the first time an existing row is read after this shipped,
  // encrypt its plaintext value and persist it -- no separate one-off
  // backfill script needed for a table this small.
  if (!data.display_name_enc && data.display_name) {
    const enc = encryptField(data.display_name);
    await supabase.from("profiles").update({ display_name_enc: enc }).eq("id", user.id);
    return NextResponse.json({ displayName: data.display_name });
  }

  return NextResponse.json({ displayName: decryptField(data.display_name_enc) });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { displayName } = await req.json();
  const name = typeof displayName === "string" ? displayName.trim() : "";

  // Plaintext display_name is kept in step for now -- existing server-side
  // readers (admin_carer_overview RPC, app/admin/shared-entries/page.tsx)
  // haven't been cut over yet, and dropping it early would break them.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, display_name_enc: encryptField(name) })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
