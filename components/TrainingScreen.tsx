"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trainingStatus } from "@/lib/domain";

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
};

type Platform = { name: string; url: string };

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

export default function TrainingScreen() {
  const supabase = createClient();
  const [courses, setCourses] = useState<Course[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [personal, setPersonal] = useState<Record<string, PersonalSuggestion>>({});
  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState("");
  const [lengthFilter, setLengthFilter] = useState("");

  async function load() {
    const [{ data: c }, { data: pl }, { data: pr }, { data: notes }] = await Promise.all([
      supabase.from("shared_training_catalog").select("*").eq("archived", false).order("sort_order"),
      supabase.from("shared_training_platforms").select("*"),
      supabase.from("training_progress").select("course_title, completed_on"),
      supabase.from("records").select("training_note, date").neq("training_note", ""),
    ]);
    setCourses((c as Course[]) ?? []);
    setPlatforms((pl as Platform[]) ?? []);
    const map: Record<string, string> = {};
    (pr ?? []).forEach((row: { course_title: string; completed_on: string }) => (map[row.course_title] = row.completed_on));
    setProgress(map);

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
    } else {
      await supabase.from("training_progress").delete().eq("course_title", title);
    }
    setProgress((prev) => ({ ...prev, [title]: date }));
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
            const url = course ? course.url || platformUrl(course.platform) : "";
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
            const url = c.url || platformUrl(c.platform);
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
