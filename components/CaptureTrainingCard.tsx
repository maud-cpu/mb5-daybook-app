"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { withAmazonAffiliateTag } from "@/lib/amazon";
import RatingWidget, { Feedback } from "@/components/TrainingRating";

type Suggestion = {
  title: string;
  reasons: string[];
  length: string;
  media: string;
  url: string;
  courseId: string | null;
  externalRating: number | null;
  externalRatingNote: string;
};

// A stable pseudo-random number for (seed, id) -- gives a shuffled order
// that doesn't move around on re-render, but looks different each time the
// page loads fresh, since `seed` is regenerated then.
function seededRandom(seed: number, id: string): number {
  let h = seed * 2654435761;
  for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
  return Math.abs(Math.sin(h));
}

// Same source as Training & Resources' "Suggested from your notes" card
// (records.training_note) and the same dismissed_training_suggestions /
// training_saved / training_feedback tables, so saving, rating or
// dismissing one place does the same thing everywhere.
export default function CaptureTrainingCard({ refreshKey }: { refreshKey?: number } = {}) {
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [randomSeed] = useState(() => Math.random());

  async function load() {
    const [{ data: notes }, { data: dismissed }, { data: courses }, { data: platforms }, { data: fb }, { data: userData }, { data: saved }] =
      await Promise.all([
        supabase.from("records").select("training_note").neq("training_note", ""),
        supabase.from("dismissed_training_suggestions").select("title"),
        supabase
          .from("shared_training_catalog")
          .select("id, title, url, length, how, platform, external_rating, external_rating_note")
          .eq("archived", false),
        supabase.from("shared_training_platforms").select("name, url"),
        supabase.from("training_feedback").select("course_id, user_id, rating, comment"),
        supabase.auth.getUser(),
        supabase.from("training_saved").select("title"),
      ]);

    const urlByPlatform: Record<string, string> = {};
    (platforms ?? []).forEach((p: { name: string; url: string }) => (urlByPlatform[p.name] = p.url));
    const courseByTitle: Record<
      string,
      { id: string; url: string; length: string; media: string; externalRating: number | null; externalRatingNote: string }
    > = {};
    (courses ?? []).forEach(
      (c: {
        id: string;
        title: string;
        url: string;
        length: string;
        how: string;
        platform: string;
        external_rating: number | string | null;
        external_rating_note: string;
      }) => {
        courseByTitle[c.title.trim().toLowerCase()] = {
          id: c.id,
          url: withAmazonAffiliateTag(c.url || urlByPlatform[c.platform] || ""),
          length: c.length || "",
          media: c.how || "",
          // shared_training_catalog.external_rating is a Postgres "numeric" column, which
          // PostgREST returns as a JSON string -- see the same cast in TrainingScreen.
          externalRating: c.external_rating == null ? null : Number(c.external_rating),
          externalRatingNote: c.external_rating_note || "",
        };
      },
    );
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
        .map(([title, info]) => {
          const course = courseByTitle[title.trim().toLowerCase()];
          return {
            title,
            reasons: info.reasons,
            length: course?.length || "",
            media: course?.media || "",
            url: course?.url || "",
            courseId: course?.id ?? null,
            externalRating: course?.externalRating ?? null,
            externalRatingNote: course?.externalRatingNote || "",
          };
        })
        .sort((a, b) => seededRandom(randomSeed, a.title) - seededRandom(randomSeed, b.title)),
    );
    setFeedback((fb as Feedback[]) ?? []);
    setMyUserId(userData?.user?.id ?? "");
    setSavedTitles(new Set(((saved as { title: string }[] | null) ?? []).map((s) => s.title)));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount, and again whenever the caller bumps refreshKey (e.g. right after Capture saves something)
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function dismiss(title: string) {
    setSuggestions((prev) => prev.filter((s) => s.title !== title));
    await supabase.from("dismissed_training_suggestions").upsert({ title }, { onConflict: "user_id,title" });
  }

  async function toggleSaved(title: string) {
    if (savedTitles.has(title)) {
      setSavedTitles((prev) => {
        const next = new Set(prev);
        next.delete(title);
        return next;
      });
      await supabase.from("training_saved").delete().eq("title", title);
    } else {
      setSavedTitles((prev) => new Set(prev).add(title));
      await supabase.from("training_saved").upsert({ title });
    }
  }

  async function rateCourse(courseId: string, rating: number, comment: string) {
    if (!myUserId) return;
    await supabase
      .from("training_feedback")
      .upsert({ course_id: courseId, user_id: myUserId, rating, comment }, { onConflict: "course_id,user_id" });
    setFeedback((prev) => [
      ...prev.filter((f) => !(f.course_id === courseId && f.user_id === myUserId)),
      { course_id: courseId, user_id: myUserId, rating, comment },
    ]);
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
            {(s.media || s.length) && <small className="muted"> · {[s.media, s.length].filter(Boolean).join(" · ")}</small>}
            {s.reasons.map((r, i) => (
              <small key={i} className="muted" style={{ display: "block", marginTop: 2 }}>
                {r}
              </small>
            ))}
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
              {s.courseId && (
                <RatingWidget
                  course={{ id: s.courseId, external_rating: s.externalRating, external_rating_note: s.externalRatingNote }}
                  feedback={feedback}
                  myUserId={myUserId}
                  onRate={rateCourse}
                  compact
                />
              )}
              {s.url && (
                <a className="chip" style={{ fontSize: 13, padding: "5px 10px" }} href={s.url} target="_blank" rel="noopener noreferrer">
                  Open ↗
                </a>
              )}
              <button
                className={`chip${savedTitles.has(s.title) ? " on" : ""}`}
                style={{ fontSize: 13, padding: "5px 10px" }}
                onClick={() => toggleSaved(s.title)}
              >
                {savedTitles.has(s.title) ? "🔖 Saved" : "🔖 Save"}
              </button>
              <button className="chip" style={{ fontSize: 13, padding: "5px 10px" }} onClick={() => dismiss(s.title)}>
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
