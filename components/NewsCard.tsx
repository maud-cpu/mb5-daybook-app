"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";

type NewsItem = {
  id: string;
  title: string;
  body: string;
  category: "training" | "announcement" | "general";
  expires_on: string | null;
  url: string;
  linked_course_id: string | null;
  created_at: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// expires_on is a bare YYYY-MM-DD date, not a timestamp -- parsed as UTC
// midnight, which can read back as the wrong day in some timezones. Anchor
// it to midday first, the same fix used for dates elsewhere in this app.
function fmtDateOnly(dateStr: string): string {
  return fmtDate(dateStr + "T12:00");
}

const CATEGORY_ICON: Record<NewsItem["category"], string> = {
  training: "🎓",
  announcement: "📣",
  general: "📌",
};

const BODY_PREVIEW_LENGTH = 90;
const URL_RE = /(https?:\/\/[^\s]+)/g;

// A pasted announcement often carries its own booking/info link inline in
// the body text -- shown as plain text before, it wasn't tappable at all.
// Splits on URLs and renders each as a real link, leaving everything else
// as plain text either side of it.
function linkify(text: string): ReactNode[] {
  // String.split with a capturing group interleaves the matches back into
  // the result at odd indices -- checked by position, not by re-testing the
  // (global, stateful) regex against each piece.
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

// A notice from Surrey/the agency (a training opportunity, a policy
// change, a deadline) used to only ever reach one carer, by whoever
// happened to get the email or WhatsApp message -- this is that same
// notice, pasted in once via admin, showing here for everyone until it's
// no longer relevant or a carer's dismissed it for themselves.
export default function NewsCard() {
  const supabase = createClient();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  async function load() {
    const t = today();
    const [{ data: news }, { data: dis }] = await Promise.all([
      supabase
        .from("shared_news")
        .select("id, title, body, category, expires_on, url, linked_course_id, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("dismissed_news").select("news_id"),
    ]);
    const active = ((news as NewsItem[] | null) ?? []).filter((n) => !n.expires_on || n.expires_on >= t);
    setItems(active);
    setDismissed(new Set(((dis as { news_id: string }[] | null) ?? []).map((d) => d.news_id)));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("dismissed_news").upsert({ user_id: user.id, news_id: id });
  }

  async function undismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("dismissed_news").delete().eq("user_id", user.id).eq("news_id", id);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visible = items.filter((n) => !dismissed.has(n.id));
  const previouslyDismissed = items.filter((n) => dismissed.has(n.id));

  // Only hide the whole card when there's genuinely never been anything to
  // show -- a household that's never had a news item posted shouldn't carry
  // a permanently empty card. Once something HAS existed, though, dismissing
  // every item shouldn't make the card (and the way back to them) disappear.
  if (!loaded || items.length === 0) return null;

  return (
    <div className="card">
      <h3>News &amp; Events</h3>
      {visible.length === 0 && <p className="empty">Nothing new right now — you&apos;re all caught up.</p>}
      {visible.length > 0 && (
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
      {visible.map((n) => {
        const isLong = n.body.length > BODY_PREVIEW_LENGTH;
        const isExpanded = expanded.has(n.id);
        const shown = isLong && !isExpanded ? n.body.slice(0, BODY_PREVIEW_LENGTH).trim() + "…" : n.body;
        return (
          <div key={n.id} className="rec" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flex: 1 }}>
              <b>
                {CATEGORY_ICON[n.category]} {n.title}
              </b>
              <br />
              <small className="muted">
                {linkify(shown)}{" "}
                {isLong && (
                  <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => toggleExpanded(n.id)}>
                    {isExpanded ? "less" : "more"}
                  </span>
                )}
              </small>
              <br />
              <small className="muted">
                Added {fmtDate(n.created_at)}
                {n.expires_on ? ` · Deadline ${fmtDateOnly(n.expires_on)}` : ""}
                {n.url && (
                  <>
                    {" · "}
                    <a href={n.url} target="_blank" rel="noopener noreferrer">
                      Open link ↗
                    </a>
                  </>
                )}
                {n.category === "training" && n.linked_course_id && (
                  <>
                    {" · "}
                    <Link href={`/dashboard/training?q=${encodeURIComponent(n.title)}`}>See in Training & Resources ↗</Link>
                  </>
                )}
              </small>
            </span>
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => dismiss(n.id)}>
              Got it
            </button>
          </div>
        );
      })}
      </div>
      )}
      {previouslyDismissed.length > 0 && (
        <>
          <p className="hint" style={{ cursor: "pointer", marginTop: 8 }} onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? "▾" : "▸"} Previously dismissed ({previouslyDismissed.length}) — tap to {showDismissed ? "hide" : "show"}
          </p>
          {showDismissed &&
            previouslyDismissed.map((n) => (
              <div key={n.id} className="rec" style={{ opacity: 0.7, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flex: 1 }}>
                  <b>
                    {CATEGORY_ICON[n.category]} {n.title}
                  </b>
                  <br />
                  <small className="muted">{linkify(n.body)}</small>
                </span>
                <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => undismiss(n.id)}>
                  Show again
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
