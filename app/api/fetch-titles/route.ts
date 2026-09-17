import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function guessMedium(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
  if (["youtube.com", "youtu.be", "vimeo.com", "ted.com"].some((h) => host === h || host.endsWith("." + h))) return "Video";
  if (
    ["open.spotify.com", "podcasts.apple.com", "soundcloud.com", "anchor.fm", "buzzsprout.com"].some(
      (h) => host === h || host.endsWith("." + h),
    )
  )
    return "Podcast";
  return "Article";
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 1) return "under a min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Best-effort only: reads whatever duration hint a page happens to embed in
 * its own HTML (YouTube's player data, or a standard video/duration meta
 * tag). Many pages expose none of these, in which case this just returns
 * null and the resource is tagged with its medium alone -- there's no paid
 * API integration here, so an exact runtime is never guaranteed.
 */
function parseDurationSeconds(html: string): number | null {
  const seconds = html.match(/"lengthSeconds":"(\d+)"/);
  if (seconds) return Number(seconds[1]);
  const ms = html.match(/"approxDurationMs":"(\d+)"/);
  if (ms) return Math.round(Number(ms[1]) / 1000);
  const ogSeconds = html.match(/<meta[^>]+property=["']video:duration["'][^>]+content=["'](\d+)["']/i);
  if (ogSeconds) return Number(ogSeconds[1]);
  const iso = html.match(/<meta[^>]+itemprop=["']duration["'][^>]+content=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?["']/i);
  if (iso) return (Number(iso[1] || 0) * 3600) + (Number(iso[2] || 0) * 60) + Number(iso[3] || 0);
  return null;
}

async function fetchTitle(url: string): Promise<{ title: string; length: string }> {
  const medium = guessMedium(url);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MB5DayBook/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return { title: "", length: medium };
    const html = await res.text();
    const seconds = parseDurationSeconds(html);
    const length = medium && seconds ? `${medium}, ${formatDuration(seconds)}` : medium;
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
    if (og?.[1]) return { title: decodeHtmlEntities(og[1]), length };
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (title?.[1]) return { title: decodeHtmlEntities(title[1]), length };
    return { title: "", length };
  } catch {
    return { title: "", length: medium };
  }
}

// Admin-only: fetches each URL's page title (and, best-effort, its medium
// and duration) server-side -- the browser can't due to cross-origin
// restrictions -- so a bulk paste of bare links can be auto-tagged instead
// of typed out by hand one at a time.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { urls } = await req.json();
  if (!Array.isArray(urls) || !urls.length) {
    return NextResponse.json({ error: "No URLs given" }, { status: 400 });
  }
  const batch = urls.slice(0, 25).filter((u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u));
  const results = await Promise.all(batch.map(async (url: string) => ({ url, ...(await fetchTitle(url)) })));
  return NextResponse.json({ results });
}
