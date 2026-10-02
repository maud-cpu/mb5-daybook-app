import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A phone/Google/Apple/Outlook calendar fetches this with no login at all
// (that's the whole point of "subscribe by URL") -- it carries no Supabase
// session cookie, so this has to live under /api/public (the one prefix
// middleware.ts already exempts from the sign-in redirect) rather than
// behind the usual auth.getUser() check every other route starts with. The
// token in the query string is the credential instead; calendar_feed_
// reminders() (0084_calendar_feed.sql) does its own lookup by it.
export const dynamic = "force-dynamic";

type FeedRow = { id: string; text: string; date: string; time_from: string | null; time_to: string | null; url: string | null };

function escapeIcsText(s: string): string {
  // RFC 5545: backslash, semicolon, comma and newlines need escaping inside
  // a text value, or a calendar app can misparse the rest of the line.
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsEventFor(r: FeedRow): string {
  const d = r.date.replace(/-/g, "");
  const summary = escapeIcsText(r.text);
  const lines = [`BEGIN:VEVENT`, `UID:${r.id}@mb5`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`];
  if (!r.time_from) {
    lines.push(`DTSTART;VALUE=DATE:${d}`);
  } else {
    const from = r.time_from.slice(0, 5).replace(":", "");
    const to = r.time_to ? r.time_to.slice(0, 5).replace(":", "") : String((Number(from.slice(0, 2)) + 1) % 24).padStart(2, "0") + from.slice(2);
    lines.push(`DTSTART:${d}T${from}00`, `DTEND:${d}T${to}00`);
  }
  lines.push(`SUMMARY:${summary}`);
  if (r.url) lines.push(`DESCRIPTION:${escapeIcsText(r.url)}`, `URL:${r.url}`);
  lines.push(`END:VEVENT`);
  return lines.join("\r\n");
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed_reminders", { p_token: token });
  if (error) return new NextResponse("Couldn't load that calendar — the link may be out of date.", { status: 404 });

  const body =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MB5 Day Book//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:MB5 Day Book\r\n" +
    ((data as FeedRow[]) ?? []).map(icsEventFor).join("\r\n") +
    "\r\nEND:VCALENDAR\r\n";

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Calendar apps poll on their own schedule (often every few hours) --
      // a short cache here just stops a burst of near-simultaneous refetches
      // (e.g. two devices subscribed to the same feed) hitting the database
      // every time, without meaningfully delaying when a change shows up.
      "Cache-Control": "public, max-age=600",
    },
  });
}
