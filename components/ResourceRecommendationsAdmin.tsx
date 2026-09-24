"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Recommendation = {
  id: string;
  title: string;
  kind: string;
  description: string;
  url: string;
};

const KIND_LABELS: Record<string, string> = {
  book: "📖 Book",
  movie: "🎬 Movie/TV",
  podcast: "🎙️ Podcast",
  other: "💡 Other",
};

export default function ResourceRecommendationsAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const supabase = createClient();
  const [pending, setPending] = useState<Recommendation[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("resource_recommendations")
      .select("id, title, kind, description, url")
      .eq("status", "pending")
      .order("created_at");
    setPending((data as Recommendation[] | null) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(id: string, status: "approved" | "rejected") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("resource_recommendations")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      showToast("Couldn't update: " + error.message);
      return;
    }
    setPending((prev) => prev.filter((r) => r.id !== id));
    showToast(status === "approved" ? "Published to Training & Resources" : "Rejected");
  }

  if (!loaded || !pending.length) return null;

  return (
    <div className="card" style={{ border: "2px solid var(--accent)" }}>
      <h3>💡 Resource suggestions to review ({pending.length})</h3>
      {pending.map((r) => (
        <div key={r.id} className="rec">
          <b>
            {KIND_LABELS[r.kind] || r.kind} {r.title}
          </b>
          {r.description && (
            <>
              <br />
              <small className="muted">{r.description}</small>
            </>
          )}
          {r.url && (
            <>
              <br />
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <small>{r.url}</small>
              </a>
            </>
          )}
          <div style={{ marginTop: 6 }}>
            <button className="chip on" onClick={() => review(r.id, "approved")}>
              Approve
            </button>{" "}
            <button className="chip" onClick={() => review(r.id, "rejected")}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
