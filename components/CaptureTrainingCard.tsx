"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withAmazonAffiliateTag } from "@/lib/amazon";

type Suggestion = { title: string; reasons: string[]; length: string; url: string };

// A stable pseudo-random number for (seed, id) -- gives a shuffled order
// that doesn't move around on re-render, but looks different each time the
// page loads fresh, since `seed` is regenerated then.
function seededRandom(seed: number, id: string): number {
  let h = seed * 2654435761;
  for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
  return Math.abs(Math.sin(h));
}

// Same source as Training & Resources' "Suggested from your notes" card
// (records.training_note) and the same dismissed_training_suggestions
// table, so dismissing one place dismisses it everywhere.
export default function CaptureTrainingCard() {
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [randomSeed] = useState(() => Math.random());

  async function load() {
    const [{ data: notes }, { data: dismissed }, { data: courses }, { data: platforms }] = await Promise.all([
      supabase.from("records").select("training_note").neq("training_note", ""),
      supabase.from("dismissed_training_suggestions").select("title"),
      supabase.from("shared_training_catalog").select("title, url, length, platform").eq("archived", false),
      supabase.from("shared_training_platforms").select("name, url"),
    ]);

    const urlByPlatform: Record<string, string> = {};
    (platforms ?? []).forEach((p: { name: string; url: string }) => (urlByPlatform[p.name] = p.url));
    const courseByTitle: Record<string, { url: string; length: string }> = {};
    (courses ?? []).forEach((c: { title: string; url: string; length: string; platform: string }) => {
      courseByTitle[c.title.trim().toLowerCase()] = {
        url: withAmazonAffiliateTag(c.url || urlByPlatform[c.platform] || ""),
        length: c.length || "",
      };
    });
    const dismissedTitles = new Set(((dismissed as { title: string }[] | null) ?? []).map((d) => d.title.trim().toLowerCase()));

    const map: Record<string, { reasons: string[] }> = {};
    ((notes as { training_note: string }[] | null) ?? []).forEach((r) => {
      r.training_note.split("\n").forEach((line) => {
        const idx = line.indexOf(" — ");
        if (idx === -1) return;
        const title = line.slice(0, idx).trim();
        const why = line.slice(idx + 3).trim();
        if (!title || !why || dismissedTitles.has(title.trim().toLowerCase())) return;
        if (!map[title]) map[title] = { reasons: [] };
        if (!map[title].reasons.includes(why)) map[title].reasons.push(why);
      });
    });

    setSuggestions(
      Object.entries(map)
        .map(([title, info]) => ({
          title,
          reasons: info.reasons,
          length: courseByTitle[title.trim().toLowerCase()]?.length || "",
          url: courseByTitle[title.trim().toLowerCase()]?.url || "",
        }))
        .sort((a, b) => seededRandom(randomSeed, a.title) - seededRandom(randomSeed, b.title)),
    );
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dismiss(title: string) {
    setSuggestions((prev) => prev.filter((s) => s.title !== title));
    await supabase.from("dismissed_training_suggestions").upsert({ title }, { onConflict: "user_id,title" });
  }

  return (
    <div className="card">
      <h3>💡 Training suggestions</h3>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : suggestions.length === 0 ? (
        <p className="muted">Nothing suggested from your notes yet.</p>
      ) : (
        suggestions.map((s) => (
          <div key={s.title} className="rec" style={{ cursor: "default" }}>
            <b>{s.title}</b>
            {s.length && <small className="muted"> · {s.length}</small>}
            {s.reasons.map((r, i) => (
              <small key={i} className="muted" style={{ display: "block", marginTop: 2 }}>
                {r}
              </small>
            ))}
            <div className="row" style={{ marginTop: 6 }}>
              {s.url && (
                <a className="chip" href={s.url} target="_blank" rel="noopener noreferrer">
                  Open ↗
                </a>
              )}
              <button className="chip" onClick={() => dismiss(s.title)}>
                Dismiss
              </button>
            </div>
          </div>
        ))
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        <Link href="/dashboard/training">Open Training & Resources ↗</Link>
      </p>
    </div>
  );
}
