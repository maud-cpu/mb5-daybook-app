import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBackupCodes, hashBackupCode } from "@/lib/mfa";

// Regenerating (or turning off 2FA) invalidates every existing code, so a
// GET here only ever needs to say how many unused ones remain, never the
// codes themselves -- they're shown once, at generation time, and never
// stored anywhere but as a hash.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { count } = await supabase.from("mfa_backup_codes").select("id", { count: "exact", head: true }).is("used_at", null);
  return NextResponse.json({ remaining: count ?? 0 });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);
  const codes = generateBackupCodes();
  const rows = codes.map((code) => ({ user_id: user.id, code_hash: hashBackupCode(code) }));
  const { error } = await supabase.from("mfa_backup_codes").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes });
}

// Called when a carer turns 2FA off entirely -- no point leaving unused
// backup codes on file for a factor that no longer exists.
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
