"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trainingStatus } from "@/lib/domain";
import { withAmazonAffiliateTag } from "@/lib/amazon";

type Course = {
  id: string;
  group_key: "pre" | "once" | "3yr" | "next";
  group_label: string;
  title: string;
  how: string;
  platform: string;
  url: string;
  length: string;
  sort_order: number;
  external_rating: number | null;
  external_rating_note: string;
  is_face_to_face: boolean;
  session_date: string | null;
};

type Platform = { name: string; url: string };

type Feedback = { course_id: string; user_id: string; rating: number; comment: string };

const GROUP_ORDER = ["next", "pre", "once", "3yr"] as const;
const LENGTH_BUCKETS = ["Under 15 min", "15–30 min", "30–60 min", "Over 1 hour", "Not timed"] as const;

function minutesOf(length: string): number | null {
  if (!length) return null;
  const hm = length.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/i);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] || 0);
  const m = length.match(/(\d+)\s*min/i);
  if (m) return Number(m[1]);
  if (/under a min/i.test(length)) return 0;
  return null;
}

function lengthBucketOf(c: Course): string {
  const mins = minutesOf(c.length);
  if (mins === null) return "Not timed";
  if (mins < 15) return "Under 15 min";
  if (mins < 30) return "15–30 min";
  if (mins < 60) return "30–60 min";
  return "Over 1 hour";
}

function mediumOf(c: Course): string {
  if (c.length) {
    const part = c.length.split(/,|—/)[0].trim();
    if (part) return part;
  }
  return c.how || "";
}

function isMandatory(c: Course): boolean {
  return c.group_key !== "next";
}

function statusFor(course: Course, completedOn: string | undefined) {
  if (!completedOn) return { label: course.group_key === "next" ? "" : "Not done", color: "var(--grey)" };
  const st = trainingStatus(course.group_key === "3yr", completedOn);
  const color = st.s === "over" ? "var(--danger)" : st.s === "soon" ? "#b36b00" : "var(--pine)";
  return { label: st.label, color };
}

type PersonalSuggestion = { reasons: string[]; dates: string[] };

function StarPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          title={`${n} star${n > 1 ? "s" : ""}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            padding: "0 1px",
            color: n <= value ? "var(--marker)" : "#ccc",
          }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function RatingWidget({
  course,
  feedback,
  myUserId,
  onRate,
}: {
  course: Course;
  feedback: Feedback[];
  myUserId: string;
  onRate: (courseId: string, rating: number, comment: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = feedback.find((f) => f.course_id === course.id && f.user_id === myUserId);
  const [comment, setComment] = useState(mine?.comment || "");
  const householdRatings = feedback.filter((f) => f.course_id === course.id);
  const householdAvg = householdRatings.length
    ? householdRatings.reduce((s, f) => s + f.rating, 0) / householdRatings.length
    : null;

  const summary = [
    course.external_rating
      ? `⭐ ${course.external_rating.toFixed(1)}${course.external_rating_note ? ` (${course.external_rating_note})` : ""}`
      : "",
    householdAvg !== null
      ? `👪 ${householdAvg.toFixed(1)} from ${householdRatings.length} carer${householdRatings.length > 1 ? "s" : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ marginTop: 4 }}>
      {summary && (
        <small className="muted" style={{ display: "block" }}>
          {summary}
        </small>
      )}
      <button className="chip" onClick={() => setOpen(!open)}>
        {mine ? "Update your rating" : "Rate this"}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <StarPicker value={mine?.rating || 0} onPick={(n) => onRate(course.id, n, comment)} />
          <input
            placeholder="Optional comment for other carers"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => mine && onRate(course.id, mine.rating, comment)}
            style={{ marginTop: 4 }}
          />
          {householdRatings
            .filter((f) => f.comment.trim())
            .map((f, i) => (
              <p key={i} className="note" style={{ marginTop: 4 }}>
                {"★".repeat(f.rating)} {f.comment}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

export default function TrainingScreen() {
  const supabase = createClient();
  const [courses, setCourses] = useState<Course[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [personal, setPersonal] = useState<Record<string, PersonalSuggestion>>({});
  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("");
  const [lengthFilter, setLengthFilter] = useState("");
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [sessionDates, setSessionDates] = useState<Record<string, string>>({});

  async function load() {
    const [{ data: c }, { data: pl }, { data: pr }, { data: notes }, { data: fb }, { data: userData }] = await Promise.all([
      supabase.from("shared_training_catalog").select("*").eq("archived", false).order("sort_order"),
      supabase.from("shared_training_platforms").select("*"),
      supabase.from("training_progress").select("course_title, completed_on, session_date"),
      supabase.from("records").select("training_note, date").neq("training_note", ""),
      supabase.from("training_feedback").select("course_id, user_id, rating, comment"),
      supabase.auth.getUser(),
    ]);
    setCourses(
      ((c as Course[]) ?? []).map((row) => ({
        ...row,
        // shared_training_catalog.external_rating is a Postgres "numeric" column, which
        // PostgREST returns as a JSON string (e.g. "3.9") to avoid losing precision --
        // without this it silently breaks course.external_rating.toFixed(1) below.
        external_rating: row.external_rating == null ? null : Number(row.external_rating),
      })),
    );
    setPlatforms((pl as Platform[]) ?? []);
    setFeedback((fb as Feedback[]) ?? []);
    setMyUserId(userData?.user?.id ?? "");
    const map: Record<string, string> = {};
    const sessionMap: Record<string, string> = {};
    (pr ?? []).forEach((row: { course_title: string; completed_on: string; session_date: string | null }) => {
      map[row.course_title] = row.completed_on;
      if (row.session_date) sessionMap[row.course_title] = row.session_date;
    });
    setProgress(map);
    setSessionDates(sessionMap);

    const personalMap: Record<string, PersonalSuggestion> = {};
    (notes ?? []).forEach((r: { training_note: string; date: string }) => {
      // training_note can hold more than one suggestion, one per line --
      // read every line rather than just the first so a note with several
      // suggested courses surfaces all of them, not only the first.
      r.training_note.split("\n").forEach((line) => {
        const idx = line.indexOf(" — ");
        if (idx === -1) return;
        const title = line.slice(0, idx).trim();
        const why = line.slice(idx + 3).trim();
        if (!title || !why) return;
        if (!personalMap[title]) personalMap[title] = { reasons: [], dates: [] };
        if (!personalMap[title].reasons.includes(why)) personalMap[title].reasons.push(why);
        personalMap[title].dates.push(r.date);
      });
    });
    setPersonal(personalMap);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setCompleted(title: string, date: string) {
    if (date) {
      await supabase.from("training_progress").upsert({ course_title: title, completed_on: date });
    } else if (sessionDates[title]) {
      // Keep the row -- a booked session date is still worth having even
      // once the "completed" tick is cleared.
      await supabase.from("training_progress").update({ completed_on: null }).eq("course_title", title);
    } else {
      await supabase.from("training_progress").delete().eq("course_title", title);
    }
    setProgress((prev) => ({ ...prev, [title]: date }));
  }

  async function setSessionDate(title: string, date: string) {
    if (date) {
      await supabase.from("training_progress").upsert({ course_title: title, session_date: date });
    } else if (progress[title]) {
      await supabase.from("training_progress").update({ session_date: null }).eq("course_title", title);
    } else {
      await supabase.from("training_progress").delete().eq("course_title", title);
    }
    setSessionDates((prev) => {
      const next = { ...prev };
      if (date) next[title] = date;
      else delete next[title];
      return next;
    });
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

  const platformUrl = (name: string) => platforms.find((p) => p.name === name)?.url || "";

  const mediaOptions = Array.from(new Set(courses.map((c) => mediumOf(c)).filter(Boolean))).sort();
  const personalTitles = new Set(Object.keys(personal).map((t) => t.trim().toLowerCase()));

  function matchesFilters(c: Course): boolean {
    if (search.trim() && !c.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (mediaFilter && mediumOf(c) !== mediaFilter) return false;
    if (lengthFilter && lengthBucketOf(c) !== lengthFilter) return false;
    return true;
  }

  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: courses.find((c) => c.group_key === key)?.group_label || key,
    rows: courses.filter(
      (c) => c.group_key === key && !personalTitles.has(c.title.trim().toLowerCase()) && matchesFilters(c),
    ),
  })).filter((g) => g.rows.length);
  const personalEntries = Object.entries(personal).filter(([title]) => {
    const course = courses.find((c) => c.title.trim().toLowerCase() === title.trim().toLowerCase());
    return course ? matchesFilters(course) : title.toLowerCase().includes(search.trim().toLowerCase());
  });
  const filtersActive = search.trim() || mediaFilter || lengthFilter;

  return (
    <div>
      <div className="card">
        <h3>Training &amp; Resources</h3>
        <p className="note">
          Enter the date you completed each course; 3-yearly ones show when they&apos;re due for renewal.
          ⭐ marks the courses that are mandatory rather than just suggested.
        </p>
        <div className="chips">
          {platforms
            .filter((p) => p.url)
            .map((p) => (
              <a key={p.name} className="chip" href={p.url} target="_blank" rel="noopener noreferrer">
                Open {p.name} ↗
              </a>
            ))}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input
            type="text"
            placeholder="Search by keyword…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 180px" }}
          />
          <select value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value)} style={{ flex: "0 0 auto" }}>
            <option value="">All media</option>
            {mediaOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={lengthFilter} onChange={(e) => setLengthFilter(e.target.value)} style={{ flex: "0 0 auto" }}>
            <option value="">Any length</option>
            {LENGTH_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>
      {personalEntries.length > 0 && (
        <div className="card" style={{ border: "2px solid var(--accent)" }}>
          <h3>Suggested from your notes</h3>
          <p className="note">These came up because of something you actually wrote, not just the general list below.</p>
          {personalEntries.map(([title, info]) => {
            const course = courses.find((c) => c.title.trim().toLowerCase() === title.trim().toLowerCase());
            const completedOn = progress[title];
            const status = course ? statusFor(course, completedOn) : { label: "", color: "" };
            const url = withAmazonAffiliateTag(course ? course.url || platformUrl(course.platform) : "");
            return (
              <div
                key={title}
                className="row"
                style={{ alignItems: "flex-start", borderBottom: "1px solid #eee", padding: "6px 0" }}
              >
                <div style={{ flex: 1 }}>
                  <b>
                    {course && isMandatory(course) && "⭐ "}
                    {title}
                  </b>
                  {course?.length && (
                    <>
                      {" "}
                      <small className="muted">· {course.length}</small>
                    </>
                  )}
                  {info.reasons.map((r, i) => (
                    <small key={i} className="muted" style={{ display: "block", marginTop: 2 }}>
                      💡 {r}
                    </small>
                  ))}
                  {status.label && (
                    <>
                      <br />
                      <small style={{ color: status.color }}>{status.label}</small>
                    </>
                  )}
                  {course && <RatingWidget course={course} feedback={feedback} myUserId={myUserId} onRate={rateCourse} />}
                </div>
                {url && (
                  <a className="chip" style={{ flex: "0 0 auto" }} href={url} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                )}
                <input
                  type="date"
                  style={{ flex: "0 0 150px" }}
                  value={completedOn || ""}
                  onChange={(e) => setCompleted(title, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
      {groups.map((g) => (
        <div className="card" key={g.key}>
          <h3>{g.label}</h3>
          {g.rows.map((c) => {
            const completedOn = progress[c.title];
            const status = statusFor(c, completedOn);
            const url = withAmazonAffiliateTag(c.url || platformUrl(c.platform));
            return (
              <div
                key={c.id}
                className="row"
                style={{ alignItems: "center", borderBottom: "1px solid #eee", padding: "6px 0" }}
              >
                <div style={{ flex: 1 }}>
                  <b>
                    {isMandatory(c) && "⭐ "}
                    {c.title}
                  </b>
                  <br />
                  <small className="muted">
                    {[c.how, c.platform, c.length].filter(Boolean).join(" · ")}
                  </small>
                  {status.label && (
                    <>
                      <br />
                      <small style={{ color: status.color }}>{status.label}</small>
                    </>
                  )}
                  <RatingWidget course={c} feedback={feedback} myUserId={myUserId} onRate={rateCourse} />
                  {c.is_face_to_face && (
                    <div style={{ marginTop: 4 }}>
                      <small className="muted">
                        🎓 Face to face{c.session_date ? ` — shared date ${c.session_date}` : ""} — on your calendar once
                        a date&apos;s set
                      </small>
                      <br />
                      <input
                        type="date"
                        placeholder="Your session date, if different"
                        value={sessionDates[c.title] || ""}
                        onChange={(e) => setSessionDate(c.title, e.target.value)}
                      />
                    </div>
                  )}
                </div>
                {url && (
                  <a className="chip" style={{ flex: "0 0 auto" }} href={url} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                )}
                <input
                  type="date"
                  style={{ flex: "0 0 150px" }}
                  value={completedOn || ""}
                  onChange={(e) => setCompleted(c.title, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      ))}
      {filtersActive && personalEntries.length === 0 && groups.length === 0 && (
        <div className="card">
          <p className="empty">No training matches that search — try clearing the filters above.</p>
        </div>
      )}
    </div>
  );
}
