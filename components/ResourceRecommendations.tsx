"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Recommendation = {
  id: string;
  title: string;
  kind: "book" | "movie" | "podcast" | "other";
  description: string;
  url: string;
  status: "pending" | "approved" | "rejected";
  suggested_by: string;
};

const KIND_ICON: Record<Recommendation["kind"], string> = {
  book: "📖",
  movie: "🎬",
  podcast: "🎙️",
  other: "💡",
};

// A book/film/podcast worth another carer knowing about isn't a formal
// training course, so it starts here as a suggestion -- but once the
// content owner approves it, it's promoted into the real catalogue below
// (as a "Next steps (suggested)" resource) rather than living in a
// separate list, so it gets the exact same display, search, and admin
// editing as everything else in Training & Resources. This card is only
// ever the intake form plus "what's mine still waiting" -- never a second
// copy of what's already published.
export default function ResourceRecommendations() {
  const supabase = createClient();
  const [mine, setMine] = useState<Recommendation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Recommendation["kind"]>("book");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("resource_recommendations")
      .select("*")
      .eq("suggested_by", user.id)
      .neq("status", "approved")
      .order("created_at", { ascending: false });
    setMine((data as Recommendation[] | null) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("resource_recommendations").insert({
        title: title.trim(),
        kind,
        description: description.trim(),
        url: url.trim(),
        suggested_by: user.id,
      });
    }
    setTitle("");
    setDescription("");
    setUrl("");
    setKind("book");
    setShowForm(false);
    setSubmitting(false);
    load();
  }

  return (
    <div className="card">
      <h3>💡 Recommended by carers</h3>
      <p className="hint">
        Books, films, podcasts — anything worth another carer knowing about. Approved suggestions
        show up in the list below, alongside everything else.
      </p>
      {mine.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="hint">Your suggestions:</p>
          {mine.map((r) => (
            <div key={r.id} className="rec" style={{ opacity: 0.7 }}>
              {KIND_ICON[r.kind]} {r.title}{" "}
              <small className="muted">— {r.status === "pending" ? "pending review" : "not published"}</small>
            </div>
          ))}
        </div>
      )}
      {!showForm ? (
        <button className="chip add" style={{ marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Recommend a resource
        </button>
      ) : (
        <div className="item" style={{ marginTop: 8 }}>
          <div className="row">
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 2 }} />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Recommendation["kind"])}
              style={{ flex: "0 0 auto", width: "auto" }}
            >
              <option value="book">📖 Book</option>
              <option value="movie">🎬 Movie/TV</option>
              <option value="podcast">🎙️ Podcast</option>
              <option value="other">💡 Other</option>
            </select>
          </div>
          <textarea
            placeholder="Why it's worth it (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ marginTop: 6 }}
          />
          <input
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ marginTop: 6 }}
          />
          <div style={{ marginTop: 8 }}>
            <button className="chip on" disabled={submitting || !title.trim()} onClick={submit}>
              Submit for review
            </button>{" "}
            <button className="chip" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
