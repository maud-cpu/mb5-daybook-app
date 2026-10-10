"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { childDocumentUrl } from "@/lib/childDocuments";

type Doc = { id: string; child_id: string; title: string; file_name: string; category: string; file_path: string; uploaded_at: string; summary: string; summarized_at: string | null };

// "How's life" generates a fresh narrative on demand from notes + whatever
// documents fit in one request -- fine for a date range, but a child's
// FULL document history (old diaries going back years) can't all be
// re-read like that every time. This instead shows the already-cached
// overview built from each document's own one-time summary (see
// lib/childLifeSummary.ts) -- cheap to redisplay no matter how many
// documents pile up, since it was never re-reading the raw files here.
export default function ChildDocumentOverview({ childId, childName }: { childId: string; childName: string }) {
  const supabase = createClient();
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState("");
  const [docCount, setDocCount] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    setLoaded(false);
    const [overviewRes, docsRes] = await Promise.all([
      fetch(`/api/child-life-summary?childId=${childId}`).then((r) => r.json()),
      fetch("/api/child-documents").then((r) => r.json()),
    ]);
    setSummary(overviewRes.summary || "");
    setDocCount(overviewRes.docCount || 0);
    setDocs(((docsRes.documents as Doc[]) ?? []).filter((d) => d.child_id === childId));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this child's overview + documents on mount / when childId changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function refresh() {
    setRefreshing(true);
    const res = await fetch("/api/child-life-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, childName }),
    });
    const data = await res.json();
    if (data.summary !== undefined) setSummary(data.summary);
    setRefreshing(false);
  }

  async function open(doc: Doc) {
    setOpeningId(doc.id);
    try {
      const url = await childDocumentUrl(supabase, doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Nothing useful to do here beyond letting them try again -- Documents, below, has its own error state for this.
    }
    setOpeningId(null);
  }

  if (!loaded) return null;
  if (!docCount && !docs.length) return null;

  return (
    <div className="card">
      <h3>About {childName}, so far</h3>
      <p className="hint">
        Built from the summaries of every document on file for {childName} — not the date range above, so it covers
        everything ever uploaded, however far back.
      </p>
      {summary ? <p style={{ whiteSpace: "pre-wrap" }}>{summary}</p> : <p className="empty">Nothing summarised yet.</p>}
      <p className="muted" style={{ marginTop: 8 }}>
        Based on {docCount} document{docCount === 1 ? "" : "s"}.{" "}
        <button className="chip" disabled={refreshing} onClick={refresh}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </p>
      {docs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {docs.map((d) => (
            <div key={d.id} className="rec">
              <b>{d.title || d.file_name}</b>{" "}
              <button className="chip" style={{ marginLeft: 6 }} disabled={openingId === d.id} onClick={() => open(d)}>
                {openingId === d.id ? "Opening…" : "Open ↗"}
              </button>
              <br />
              <small className="muted">
                {[d.category, new Date(d.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
              {d.summary && (
                <p className="hint" style={{ marginTop: 4 }}>
                  {d.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
