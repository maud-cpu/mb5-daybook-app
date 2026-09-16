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

async function fetchTitle(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MB5DayBook/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const html = await res.text();
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
    if (og?.[1]) return decodeHtmlEntities(og[1]);
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (title?.[1]) return decodeHtmlEntities(title[1]);
    return "";
  } catch {
    return "";
  }
}

// Admin-only: fetches each URL's page title server-side (the browser can't
// due to cross-origin restrictions), so a bulk paste of bare links can be
// auto-titled instead of typed out by hand one at a time.
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
  const results = await Promise.all(batch.map(async (url: string) => ({ url, title: await fetchTitle(url) })));
  return NextResponse.json({ results });
}
