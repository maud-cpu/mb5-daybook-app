"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { linkify } from "@/lib/linkify";

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
  const [savedAction, setSavedAction] = useState<Record<string, string>>({});
  const [lastSignInAt, setLastSignInAt] = useState("");
  const [actionsByNewsId, setActionsByNewsId] = useState<Record<string, string[]>>({});

  async function load() {
    const t = today();
    const [{ data: news }, { data: dis }, { data: userData }] = await Promise.all([
      supabase
        .from("shared_news")
        .select("id, title, body, category, expires_on, url, linked_course_id, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("dismissed_news").select("news_id, dismissed_at, actions_taken"),
      supabase.auth.getUser(),
    ]);
    const active = ((news as NewsItem[] | null) ?? []).filter((n) => !n.expires_on || n.expires_on >= t);
    setItems(active);
    const rows = (dis as { news_id: string; dismissed_at: string | null; actions_taken: string[] | null }[] | null) ?? [];
    setDismissed(new Set(rows.filter((d) => d.dismissed_at).map((d) => d.news_id)));
    const actions: Record<string, string[]> = {};
    rows.forEach((d) => {
      if (d.actions_taken?.length) actions[d.news_id] = d.actions_taken;
    });
    setActionsByNewsId(actions);
    // Stays fixed at the moment of this session's sign-in (auto-lock's
    // re-entered password counts as one) until the next real sign-in --
    // not touched by ordinary token refreshes -- so it's a stable "since I
    // last properly came back to the app" marker for the whole session.
    setLastSignInAt(userData.user?.last_sign_in_at || "");
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
    if (user) await supabase.from("dismissed_news").upsert({ user_id: user.id, news_id: id, dismissed_at: new Date().toISOString() });
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
    if (user) await supabase.from("dismissed_news").update({ dismissed_at: null }).eq("user_id", user.id).eq("news_id", id);
  }

  function flashSaved(id: string, label: string) {
    setSavedAction((prev) => ({ ...prev, [id]: label }));
    setTimeout(() => setSavedAction((prev) => ({ ...prev, [id]: "" })), 2000);
  }

  // Recorded permanently (not just the 2-second toast) so the buttons can
  // show "already added" even after leaving and coming back -- easy to
  // forget otherwise, since the buttons used to just revert to plain text.
  async function recordAction(id: string, action: string) {
    const next = Array.from(new Set([...(actionsByNewsId[id] || []), action]));
    setActionsByNewsId((prev) => ({ ...prev, [id]: next }));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("dismissed_news").upsert({ user_id: user.id, news_id: id, actions_taken: next }, { onConflict: "user_id,news_id" });
  }

  // reminders/records have nowhere to store a structured link, only free
  // text -- folding the URL into the text itself (rather than dropping it)
  // is what lets it survive the trip and still show up as a tappable link
  // wherever that text is later linkified.
  function bodyWithLink(n: NewsItem): string {
    return n.url ? `${n.body}${n.body ? "\n\n" : ""}${n.url}` : n.body;
  }

  async function addToCalendar(n: NewsItem) {
    await supabase.from("reminders").insert({
      text: n.title,
      date: n.expires_on || today(),
      category: n.category === "training" ? "training" : "surrey",
      source_text: bodyWithLink(n),
    });
    flashSaved(n.id, "Added to calendar");
    recordAction(n.id, "calendar");
  }

  async function addToTodo(n: NewsItem) {
    await supabase.from("reminders").insert({
      text: n.title,
      date: today(),
      category: n.category === "training" ? "training" : "surrey",
      source_text: bodyWithLink(n),
      todo_only: true,
    });
    flashSaved(n.id, "Added to Up next");
    recordAction(n.id, "todo");
  }

  async function saveToNotes(n: NewsItem) {
    const body = bodyWithLink(n);
    await supabase.from("records").insert({
      bucket: "scratch",
      text: body ? `${n.title} — ${body}` : n.title,
      date: today(),
    });
    flashSaved(n.id, "Saved to notes");
    recordAction(n.id, "notes");
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
        const isNew = lastSignInAt && n.created_at > lastSignInAt;
        return (
          <div
            key={n.id}
            className="rec"
            style={{ display: "flex", alignItems: "flex-start", gap: 8, ...(isNew ? { borderLeft: "3px solid var(--accent)", paddingLeft: 8 } : {}) }}
          >
            <span style={{ flex: 1 }}>
              <b>
                {isNew && (
                  <span className="chip on" style={{ fontSize: 10, padding: "1px 6px", marginRight: 6, verticalAlign: "middle" }}>
                    NEW
                  </span>
                )}
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
              <div style={{ marginTop: 4 }}>
                <button
                  className={actionsByNewsId[n.id]?.includes("calendar") ? "chip on" : "chip"}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => addToCalendar(n)}
                >
                  {actionsByNewsId[n.id]?.includes("calendar") ? "✓ On calendar" : "📅 Calendar"}
                </button>
                <button
                  className={actionsByNewsId[n.id]?.includes("todo") ? "chip on" : "chip"}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => addToTodo(n)}
                >
                  {actionsByNewsId[n.id]?.includes("todo") ? "✓ In Up next" : "✅ To-do"}
                </button>
                <button
                  className={actionsByNewsId[n.id]?.includes("notes") ? "chip on" : "chip"}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => saveToNotes(n)}
                >
                  {actionsByNewsId[n.id]?.includes("notes") ? "✓ Saved" : "📝 Notes"}
                </button>
                {savedAction[n.id] && (
                  <small className="muted" style={{ marginLeft: 6 }}>
                    {savedAction[n.id]}
                  </small>
                )}
              </div>
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
