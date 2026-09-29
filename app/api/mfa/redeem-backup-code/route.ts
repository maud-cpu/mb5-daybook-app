import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashBackupCode, newBypassToken, bypassExpiry, MFA_BYPASS_COOKIE } from "@/lib/mfa";

// Stands in for a TOTP challenge at login when a carer has lost their
// authenticator device. Doesn't touch Supabase's own aal2 (only a real
// verify against the enrolled factor can set that) -- instead sets a
// time-boxed bypass cookie that mfaSatisfied() (lib/mfa.ts) accepts in its
// place, checked on every request by middleware and requireUser().
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code } = await req.json();
  if (!code || typeof code !== "string") return NextResponse.json({ error: "Enter a backup code" }, { status: 400 });

  const { data: row } = await supabase
    .from("mfa_backup_codes")
    .select("id")
    .eq("code_hash", hashBackupCode(code))
    .is("used_at", null)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "That code doesn't match one of your unused backup codes." }, { status: 400 });

  const token = newBypassToken();
  const { error } = await supabase
    .from("mfa_backup_codes")
    .update({ used_at: new Date().toISOString(), bypass_token: token, bypass_expires_at: bypassExpiry() })
    .eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabase.from("mfa_backup_codes").select("id", { count: "exact", head: true }).is("used_at", null);

  const res = NextResponse.json({ ok: true, remaining: count ?? 0 });
  res.cookies.set(MFA_BYPASS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // No maxAge -- dies with the browser session; bypass_expires_at above
    // is the real, server-checked limit.
  });
  return res;
}
