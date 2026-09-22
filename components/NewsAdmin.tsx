"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";

type NewsItem = {
  id: string;
  title: string;
  body: string;
  category: "training" | "announcement" | "general";
  expires_on: string | null;
  linked_course_id: string | null;
  created_at: string;
};

type PendingNews = {
  title: string;
  body: string;
  category: "training" | "announcement" | "general";
  expiresOn: string | null;
  trainingUrl: string;
  trainingProvider: string;
  trainingCost: string;
  addToTraining: boolean;
};

const CATEGORY_LABELS: Record<NewsItem["category"], string> = {
  training: "🎓 Training",
  announcement: "📣 Announcement",
  general: "📌 General",
};

export default function NewsAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const supabase = createClient();
  const [newsText, setNewsText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [pending, setPending] = useState<PendingNews[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [showExpired, setShowExpired] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  async function load() {
    const { data } = await supabase.from("shared_news").select("*").order("created_at", { ascending: false });
    setItems((data as NewsItem[] | null) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function extractNews() {
    if (!newsText.trim()) return;
    setExtracting(true);
    setExtractError("");
    try {
      const res = await fetch("/api/extract-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newsText }),
      });
      const data = await res.json();
      if (data.error) {
        setExtractError(data.error);
        return;
      }
      const found: PendingNews[] = (data.items ?? []).map(
        (it: {
          title: string;
          body: string;
          category: NewsItem["category"];
          expiresOn: string | null;
          trainingUrl: string;
          trainingProvider: string;
          trainingCost: string;
        }) => ({
          title: it.title,
          body: it.body,
          category: it.category,
          expiresOn: it.expiresOn,
          trainingUrl: it.trainingUrl,
          trainingProvider: it.trainingProvider,
          trainingCost: it.trainingCost,
          addToTraining: it.category === "training",
        }),
      );
      if (!found.length) {
        setExtractError("Couldn't find anything worth sharing in that text.");
        return;
      }
      setPending((prev) => [...prev, ...found]);
      setNewsText("");
    } catch {
      setExtractError("Couldn't read that — check your connection and try again.");
    } finally {
      setExtracting(false);
    }
  }

  function updatePending(i: number, patch: Partial<PendingNews>) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function discardPending(i: number) {
    setPending((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function publishPending(i: number) {
    const p = pending[i];
    if (!p.title.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let linkedCourseId: string | null = null;
    if (p.addToTraining) {
      const description = p.body + (p.trainingCost ? `\nCost: ${p.trainingCost}` : "");
      const { data: course, error: courseError } = await supabase
        .from("shared_training_catalog")
        .insert({
          group_key: "next",
          group_label: "Next steps (suggested)",
          title: p.title,
          url: p.trainingUrl,
          how: p.trainingProvider,
          description,
          sort_order: 999,
        })
        .select("id")
        .single();
      if (courseError) {
        showToast("Couldn't add to Training & Resources: " + courseError.message);
        return;
      }
      linkedCourseId = course?.id ?? null;
    }

    const { error } = await supabase.from("shared_news").insert({
      title: p.title,
      body: p.body,
      category: p.category,
      expires_on: p.expiresOn,
      linked_course_id: linkedCourseId,
      source_text: newsText,
      created_by: user?.id ?? null,
    });
    if (error) {
      showToast("Couldn't publish: " + error.message);
      return;
    }
    discardPending(i);
    load();
    showToast(p.addToTraining ? "Published — also added to Training & Resources" : "Published to News & Events");
  }

  async function deleteNews(id: string) {
    if (!confirm("Remove this notice for everyone?")) return;
    await supabase.from("shared_news").delete().eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  const t = today();
  const byDateAdded = (a: NewsItem, b: NewsItem) =>
    sortOrder === "newest" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at);
  const activeItems = items.filter((n) => !n.expires_on || n.expires_on >= t).sort(byDateAdded);
  const expiredItems = items.filter((n) => n.expires_on && n.expires_on < t).sort(byDateAdded);

  return (
    <div className="card">
      <h3>News &amp; Events</h3>
      <p className="hint">
        Paste an email, WhatsApp message, or announcement from Surrey or the agency — training opportunities, policy
        changes, anything worth every carer seeing. It shows on everyone&apos;s Capture page; a training item is also
        offered as an add to Training &amp; Resources.
      </p>
      <textarea
        placeholder="Paste the email/message here…"
        value={newsText}
        onChange={(e) => setNewsText(e.target.value)}
        style={{ minHeight: 100 }}
      />
      <button className="chip" disabled={extracting || !newsText.trim()} onClick={extractNews}>
        {extracting ? "Reading…" : "Extract news items"}
      </button>
      {extractError && (
        <p className="note" style={{ color: "var(--danger)", marginTop: 6 }}>
          {extractError}
        </p>
      )}

      {pending.map((p, i) => (
        <div key={i} className="item" style={{ marginTop: 12 }}>
          <div className="row">
            <input
              placeholder="Title"
              value={p.title}
              onChange={(e) => updatePending(i, { title: e.target.value })}
              style={{ flex: 2 }}
            />
            <select
              value={p.category}
              onChange={(e) => updatePending(i, { category: e.target.value as PendingNews["category"] })}
              style={{ flex: "0 0 auto", width: "auto" }}
            >
              <option value="announcement">📣 Announcement</option>
              <option value="training">🎓 Training</option>
              <option value="general">📌 General</option>
            </select>
          </div>
          <textarea value={p.body} onChange={(e) => updatePending(i, { body: e.target.value })} style={{ marginTop: 6 }} />
          <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
            <label className="hint" style={{ flex: "0 0 auto" }}>
              Stops showing after
            </label>
            <input
              type="date"
              value={p.expiresOn || ""}
              onChange={(e) => updatePending(i, { expiresOn: e.target.value || null })}
              style={{ flex: "0 0 170px" }}
            />
            <span className="muted" style={{ fontSize: 13 }}>
              (leave blank to show until you remove it)
            </span>
          </div>
          {p.category === "training" && (
            <div style={{ marginTop: 8, padding: 8, background: "#fbfaf6", borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={p.addToTraining}
                  onChange={(e) => updatePending(i, { addToTraining: e.target.checked })}
                />
                Also add to Training &amp; Resources
              </label>
              {p.addToTraining && (
                <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                  <input
                    placeholder="Booking link (optional)"
                    value={p.trainingUrl}
                    onChange={(e) => updatePending(i, { trainingUrl: e.target.value })}
                  />
                  <input
                    placeholder="Who's running it (optional)"
                    value={p.trainingProvider}
                    onChange={(e) => updatePending(i, { trainingProvider: e.target.value })}
                  />
                  <input
                    placeholder="Cost (optional)"
                    value={p.trainingCost}
                    onChange={(e) => updatePending(i, { trainingCost: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button className="chip on" onClick={() => publishPending(i)}>
              Publish
            </button>{" "}
            <button className="chip" onClick={() => discardPending(i)}>
              Discard
            </button>
          </div>
        </div>
      ))}

      {activeItems.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", margin: "0 0 6px" }}>
            <b style={{ fontSize: 14 }}>Currently showing ({activeItems.length})</b>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
              style={{ flex: "0 0 auto", width: "auto" }}
            >
              <option value="newest">Newest added first</option>
              <option value="oldest">Oldest added first</option>
            </select>
          </div>
          {activeItems.map((n) => (
            <div key={n.id} className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flex: 1 }}>
                <b>
                  {CATEGORY_LABELS[n.category]} {n.title}
                </b>
                <br />
                <small className="muted">
                  {n.body.length > 100 ? n.body.slice(0, 100) + "…" : n.body}
                  {n.expires_on ? ` · until ${n.expires_on}` : ""}
                </small>
              </span>
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => deleteNews(n.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {expiredItems.length > 0 && (
        <>
          <p className="hint" style={{ marginTop: 10, cursor: "pointer" }} onClick={() => setShowExpired(!showExpired)}>
            {showExpired ? "▾" : "▸"} Expired ({expiredItems.length}) — tap to {showExpired ? "hide" : "show"}
          </p>
          {showExpired &&
            expiredItems.map((n) => (
              <div key={n.id} className="rec" style={{ opacity: 0.6, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flex: 1 }}>
                  <b>
                    {CATEGORY_LABELS[n.category]} {n.title}
                  </b>
                  <br />
                  <small className="muted">expired {n.expires_on}</small>
                </span>
                <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => deleteNews(n.id)}>
                  Remove
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
