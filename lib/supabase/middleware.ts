import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mfaSatisfied } from "@/lib/mfa";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Vercel Cron calls /api/cron/* with no session cookie at all, the same
  // problem /api/public solves for the calendar feed -- it's not "public"
  // data though, so it stays its own prefix and is secured by the route's
  // own CRON_SECRET bearer-token check instead of a user session.
  const isPublic = path === "/login" || path.startsWith("/_next") || path.startsWith("/api/public") || path.startsWith("/api/cron");
  // The MFA challenge/redeem endpoints have to stay reachable even for a
  // signed-in user who hasn't cleared MFA yet -- they're exactly how that
  // gets satisfied, so gating them the same as everything else would be a
  // deadlock.
  const isMfaRoute = path.startsWith("/api/mfa/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isMfaRoute) {
    const mfaOk = await mfaSatisfied(supabase, request.cookies);
    if (!mfaOk && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (mfaOk && path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
