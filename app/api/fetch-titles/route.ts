import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
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
  const ogSeconds = html.match(/<meta[^>]+property=["'](?:video|music):duration["'][^>]+content=["'](\d+)["']/i);
  if (ogSeconds) return Number(ogSeconds[1]);
  const metaIso = html.match(/<meta[^>]+itemprop=["']duration["'][^>]+content=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?["']/i);
  if (metaIso) return Number(metaIso[1] || 0) * 3600 + Number(metaIso[2] || 0) * 60 + Number(metaIso[3] || 0);
  // Schema.org JSON-LD often embeds duration as "duration":"PT18M43S" rather
  // than as a meta tag -- catch that shape too.
  const jsonIso = html.match(/"duration"\s*:\s*"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/i);
  if (jsonIso) return Number(jsonIso[1] || 0) * 3600 + Number(jsonIso[2] || 0) * 60 + Number(jsonIso[3] || 0);
  return null;
}

/** Provider name (podcast show, YouTube channel) via the platform's own oEmbed endpoint. No API key needed for these. */
async function fetchProvider(url: string, host: string): Promise<string> {
  let oembedUrl = "";
  if (host === "open.spotify.com") oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  else if (host === "youtube.com" || host === "youtu.be" || host === "www.youtube.com")
    oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  else if (host === "vimeo.com") oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  else return "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const data = await res.json();
    return data?.author_name ? decodeHtmlEntities(String(data.author_name)) : "";
  } catch {
    return "";
  }
}

async function fetchTitle(url: string): Promise<{ title: string; length: string }> {
  const medium = guessMedium(url);
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // fall through with an empty host; fetchProvider/guessMedium already handle this
  }
  const provider = await fetchProvider(url, host);

  let title = "";
  let seconds: number | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MB5DayBook/1.0)" },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      seconds = parseDurationSeconds(html);
      const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
      if (og?.[1]) title = decodeHtmlEntities(og[1]);
      else {
        const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (t?.[1]) title = decodeHtmlEntities(t[1]);
      }
    }
  } catch {
    // title/seconds stay at their defaults; medium/provider (already fetched) still apply
  }

  const base = medium && seconds ? `${medium}, ${formatDuration(seconds)}` : medium;
  const length = provider ? (base ? `${base} — ${provider}` : provider) : base;
  return { title, length };
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
