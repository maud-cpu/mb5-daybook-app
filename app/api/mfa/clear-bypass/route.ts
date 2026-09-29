import { NextResponse } from "next/server";
import { MFA_BYPASS_COOKIE } from "@/lib/mfa";

// Called alongside sign-out so a backup-code bypass from this browser can
// never carry over into whoever signs in next on the same device -- the
// cookie has no expiry of its own otherwise (see redeem-backup-code).
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MFA_BYPASS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
