"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import {
  EntryRecord,
  REMINDER_CATEGORIES,
  REPEAT_OPTIONS,
  Reminder,
  reminderCategoryIcon,
  reminderCategoryText,
} from "@/lib/types";
import { addDays, clubText, groupClubsByOccurrence, mondayStartWeekday, occurrenceDates, personColor } from "@/lib/calendarHelpers";
import PeoplePicker, { PersonOption } from "@/components/PeoplePicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import PersonTags, { PersonDot } from "@/components/PersonTags";
import { useHouseholdNames } from "@/lib/useHouseholdNames";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A face-to-face training session isn't a real row in reminders -- it's
// read-only here, merged in from the Training tab so it shows on the same
// grid without needing a second place to look. Marked by this id prefix.
const F2F_PREFIX = "f2f:";
function f2fReminder(id: string, text: string, date: string): Reminder {
  return {
    id: F2F_PREFIX + id,
    text,
    date,
    time_from: null,
    time_to: null,
    done: false,
    done_at: null,
    category: "training",
    child: "",
    people: [],
    amount: null,
    series_id: null,
    source_text: "",
  };
}

// A club a child attends isn't a real row in reminders either -- it recurs
// every week indefinitely, so rather than pre-generating (and having to
// clean up) months of real rows, one virtual entry is synthesised per day
// in the visible month whenever that day's weekday matches. Edited from
// About us, not here -- read-only, like a face-to-face training session.
const CLUB_PREFIX = "club:";
function clubReminder(clubKey: string, text: string, date: string, childNames: string[], timeFrom: string, timeTo: string): Reminder {
  return {
    id: `${CLUB_PREFIX}${clubKey}:${date}`,
    text,
    date,
    time_from: timeFrom || null,
    time_to: timeTo || null,
    done: false,
    done_at: null,
    category: "club",
    child: "",
    people: childNames,
    amount: null,
    series_id: null,
    source_text: "",
  };
}


function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Monday-start weekday index for the 1st of the month (0 = Monday ... 6 = Sunday)
function leadingBlanks(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

type Draft = { text: string; date: string; category: string; people: string[]; amount: string; time_from: string; time_to: string };
const emptyDraft = (date: string): Draft => ({
  text: "",
  date,
  category: REMINDER_CATEGORIES[0][0],
  people: [],
  amount: "",
  time_from: "",
  time_to: "",
});

// A reminder linked to a priced daycare record (see 0074_reminder_record_link.sql)
// can edit that record's own hours/time here too, so Entries and Expenses see
// the same change instead of only this reminder's text/date copy.
type RecordDraft = { id: string; hours: string; time_from: string; time_to: string };

type ExtractedItem = {
  _k: string;
  text: string;
  date: string;
  category: string;
  people: string[];
  amount: number | null;
  repeat: string;
  until: string | null;
  url: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  source: string;
};

export default function CalendarScreen() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const t = today();
  // A search result or other deep link can point at any date, not just
  // today -- land on that date's month and have it already selected.
  const dateParam = searchParams.get("date");
  const linkedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const now = new Date((linkedDate || t) + "T12:00");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [selected, setSelected] = useState<string | null>(linkedDate || t);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(t));
  const [repeat, setRepeat] = useState("none");
  const [until, setUntil] = useState(t);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [editRecordDraft, setEditRecordDraft] = useState<RecordDraft | null>(null);
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [peopleFilter, setPeopleFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showSourceFor, setShowSourceFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);
  const [feedToken, setFeedToken] = useState("");
  // Distinguishes "haven't heard back from /api/household yet" from
  // "heard back, and there's genuinely no token" -- a household row
  // whose calendar_feed_token column migration hasn't reached this
  // database yet (or whose schema cache hasn't picked it up) looks
  // exactly like the former forever, with no way out, unless the two
  // are told apart.
  const [feedTokenLoaded, setFeedTokenLoaded] = useState(false);
  const [showPhoneSubscribe, setShowPhoneSubscribe] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const { authorOf, myId } = useHouseholdNames();

  useEffect(() => {
    fetch("/api/household")
      .then((r) => r.json())
      .then(({ household }) => {
        setFeedToken(household?.calendar_feed_token || "");
        setFeedTokenLoaded(true);
      });
  }, []);

  async function load() {
    const from = isoOf(year, month, 1);
    const to = isoOf(year, month, daysInMonth(year, month));
    const [remindersRes, kidsRes, hhKidsRes, adultsRes, { data: f2fCourses }, { data: f2fProgress }, clubsRes, recordsRes] = await Promise.all([
      fetch("/api/reminders").then((r) => r.json()),
      fetch("/api/children").then((r) => r.json()),
      fetch("/api/household-children").then((r) => r.json()),
      fetch("/api/household-adults").then((r) => r.json()),
      supabase.from("shared_training_catalog").select("id, title, session_date").eq("is_face_to_face", true).eq("archived", false),
      supabase.from("training_progress").select("course_title, session_date").not("session_date", "is", null),
      fetch("/api/child-clubs").then((r) => r.json()),
      fetch("/api/records").then((r) => r.json()),
    ]);
    setRecords((recordsRes.records as EntryRecord[]) ?? []);
    const kids = kidsRes.children;
    const hhKids = hhKidsRes.children;
    const adults = adultsRes.adults;
    const rem = ((remindersRes.reminders as { date: string; todo_only: boolean }[]) ?? [])
      .filter((r) => r.date >= from && r.date <= to && !r.todo_only)
      .sort((a, b) => a.date.localeCompare(b.date));
    const clubs = clubsRes.clubs;
    const myDateByTitle: Record<string, string> = {};
    (f2fProgress ?? []).forEach((p: { course_title: string; session_date: string | null }) => {
      if (p.session_date) myDateByTitle[p.course_title] = p.session_date;
    });
    const f2fReminders = (f2fCourses ?? [])
      .map((c: { id: string; title: string; session_date: string | null }) => {
        const date = myDateByTitle[c.title] || c.session_date;
        return date && date >= from && date <= to ? f2fReminder(c.id, c.title, date) : null;
      })
      .filter((r): r is Reminder => r !== null);

    const childNameById: Record<string, string> = {};
    ((kids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    ((hhKids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    const clubReminders: Reminder[] = [];
    const clubRows = (clubs ?? []) as { id: string; child_id: string; club_name: string; weekday: number; time_from: string; time_to: string }[];
    groupClubsByOccurrence(clubRows, childNameById).forEach((c) => {
      const text = clubText(c.club_name, c.time_from, c.time_to);
      for (let d = 1; d <= daysInMonth(year, month); d++) {
        const iso = isoOf(year, month, d);
        if (mondayStartWeekday(iso) === c.weekday) clubReminders.push(clubReminder(c.id, text, iso, c.childNames, c.time_from, c.time_to));
      }
    });

    setReminders([...((rem as Reminder[]) ?? []), ...f2fReminders, ...clubReminders]);
    setPersonOptions(
      [
        ...((kids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
        ...((hhKids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
        ...((adults as { name: string }[] | null) ?? []).map((a) => ({ name: a.name, kind: "adult" as const })),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-load whenever the visible month changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelected(t);
  }

  const visibleReminders = reminders.filter(
    (r) =>
      (categoryFilter.length === 0 || categoryFilter.includes(r.category)) &&
      (peopleFilter.length === 0 || r.people.some((p) => peopleFilter.includes(p))),
  );

  const byDate: Record<string, Reminder[]> = {};
  visibleReminders.forEach((r) => {
    (byDate[r.date] ||= []).push(r);
  });

  const blanks = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  async function addReminder() {
    if (!draft.text.trim() || !draft.date) return;
    const base = {
      text: draft.text.trim(),
      category: draft.category,
      people: draft.people,
      amount: draft.amount ? Number(draft.amount) : null,
      time_from: draft.time_from || null,
      time_to: draft.time_to || null,
    };
    let rows: Record<string, unknown>[];
    if (repeat === "none") {
      rows = [{ ...base, date: draft.date }];
    } else {
      const seriesId = crypto.randomUUID();
      rows = occurrenceDates(draft.date, until, repeat).map((d) => ({ ...base, date: d, series_id: seriesId }));
    }
    await fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
    setAdding(false);
    setRepeat("none");
    load();
  }

  async function extractFromPaste() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    setExtractError("");
    try {
      const res = await fetch("/api/extract-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (data.error) {
        setExtractError(data.error);
      } else if (!data.items?.length) {
        setExtractError("Couldn't find any dates, payments or events in that.");
      } else {
        const source = pasteText;
        setExtracted((prev) => [
          ...prev,
          ...data.items.map((it: Omit<ExtractedItem, "_k" | "source">) => ({ ...it, _k: crypto.randomUUID(), source })),
        ]);
        setPasteText("");
      }
    } catch {
      setExtractError("Couldn't reach the extraction service — try again in a moment.");
    }
    setExtracting(false);
  }

  async function setNewFeedToken() {
    setRegenerating(true);
    const newToken = crypto.randomUUID();
    await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendar_feed_token: newToken }),
    });
    setFeedToken(newToken);
    setRegenerating(false);
  }

  async function regenerateFeedLink() {
    if (!confirm("Get a new link? Your old one will stop working on any device already subscribed to it.")) return;
    await setNewFeedToken();
  }

  function copyFeedLink(url: string) {
    navigator.clipboard.writeText(url).then(
      () => setCopyMsg("Copied"),
      () => setCopyMsg("Couldn't copy"),
    );
    setTimeout(() => setCopyMsg(""), 2000);
  }

  function updateExtracted(k: string, patch: Partial<ExtractedItem>) {
    setExtracted((prev) => prev.map((it) => (it._k === k ? { ...it, ...patch } : it)));
  }

  function discardExtracted(k: string) {
    setExtracted((prev) => prev.filter((it) => it._k !== k));
  }

  async function commitExtracted(items: ExtractedItem[]) {
    const rows: Record<string, unknown>[] = [];
    for (const it of items) {
      const base = {
        text: it.text,
        category: it.category,
        people: it.people,
        amount: it.amount,
        source_text: it.source,
        url: it.url,
        time_from: it.timeFrom,
        time_to: it.timeTo,
      };
      if (it.repeat === "none" || !it.until) {
        rows.push({ ...base, date: it.date });
      } else {
        const seriesId = crypto.randomUUID();
        occurrenceDates(it.date, it.until, it.repeat).forEach((d) => rows.push({ ...base, date: d, series_id: seriesId }));
      }
    }
    await fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
    setExtracted((prev) => prev.filter((it) => !items.includes(it)));
    load();
  }

  async function toggleDone(r: Reminder) {
    const done = !r.done;
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, patch: { done, done_at: done ? new Date().toISOString() : null } }),
    });
  }

  function draftFrom(r: Reminder): Draft {
    return {
      text: r.text,
      date: r.date,
      category: r.category,
      people: r.people,
      amount: r.amount != null ? String(r.amount) : "",
      time_from: r.time_from ?? "",
      time_to: r.time_to ?? "",
    };
  }

  function startEdit(r: Reminder) {
    if (r.id.startsWith(F2F_PREFIX) || r.id.startsWith(CLUB_PREFIX)) return;
    setEditingId(r.id);
    setEditDraft(draftFrom(r));
    const rec = r.record_id ? records.find((x) => x.id === r.record_id) : undefined;
    setEditRecordDraft(rec ? { id: rec.id, hours: rec.hours != null ? String(rec.hours) : "", time_from: rec.time_from ?? "", time_to: rec.time_to ?? "" } : null);
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editDraft.text.trim() || !editDraft.date) return;
    const patch = {
      text: editDraft.text.trim(),
      date: editDraft.date,
      category: editDraft.category,
      people: editDraft.people,
      amount: editDraft.amount ? Number(editDraft.amount) : null,
      time_from: editDraft.time_from || null,
      time_to: editDraft.time_to || null,
      edited_by: myId,
    };
    const recordDraft = editRecordDraft;
    setEditingId(null);
    setEditDraft(null);
    setEditRecordDraft(null);
    await Promise.all([
      fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      }),
      // Keep the linked record (the one Entries/Expenses actually price) in
      // step with whatever just changed here, instead of only updating this
      // reminder's own text/date copy.
      recordDraft
        ? fetch("/api/records", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: recordDraft.id,
              patch: {
                date: editDraft.date,
                hours: recordDraft.hours === "" ? null : Number(recordDraft.hours),
                time_from: recordDraft.time_from || null,
                time_to: recordDraft.time_to || null,
              },
            }),
          })
        : Promise.resolve(),
    ]);
    load();
  }

  function deleteOne(r: Reminder) {
    setPendingDelete(r);
  }

  async function confirmDeleteOne(keepLinked = false) {
    const r = pendingDelete;
    if (!r) return;
    setPendingDelete(null);
    // record_ids (0085) covers a reminder merged from several daycare
    // sessions -- record_id alone is only ever the single clean-link case.
    const recordIds = [...new Set([r.record_id, ...(r.record_ids || [])].filter((x): x is string => !!x))];
    setEditingId(null);
    const [remRes] = await Promise.all([
      fetch(`/api/reminders?id=${r.id}`, { method: "DELETE" }).then((res) => res.json()),
      !keepLinked && recordIds.length ? fetch(`/api/records?ids=${recordIds.join(",")}`, { method: "DELETE" }) : Promise.resolve(),
    ]);
    if (remRes?.error) alert(`Couldn't remove "${r.text}": ${remRes.error}`);
    load();
  }

  async function stopRepeating(r: Reminder) {
    if (!r.series_id) return;
    if (!confirm(`Remove "${r.text}" and every future occurrence? Past/done ones are kept.`)) return;
    setEditingId(null);
    const { reminders: all } = await fetch("/api/reminders").then((res) => res.json());
    const ids = ((all as Reminder[]) ?? [])
      .filter((x) => x.series_id === r.series_id && !x.done && x.date >= r.date)
      .map((x) => x.id);
    if (ids.length) await fetch(`/api/reminders?ids=${ids.join(",")}`, { method: "DELETE" });
    load();
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  const dayItems = selected ? (byDate[selected] ?? []) : [];

  function toggleFilter(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const feedUrlHttps = feedToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/calendar-feed?token=${feedToken}` : "";
  const feedUrlWebcal = feedUrlHttps.replace(/^https?:\/\//, "webcal://");
  const pendingDeleteHasRecord = pendingDelete
    ? [pendingDelete.record_id, ...(pendingDelete.record_ids || [])].filter(Boolean).length > 0
    : false;

  return (
    <div>
      <div className="card">
        <p className="hint" style={{ cursor: "pointer" }} onClick={() => setShowPhoneSubscribe((v) => !v)}>
          {showPhoneSubscribe ? "▾" : "▸"} 📱 Subscribe on your phone / Google Calendar
        </p>
        {showPhoneSubscribe && (
          <>
            <p className="hint">
              Add this once as a calendar subscription (not a one-off import) and it keeps itself up to date on its
              own — most calendar apps check for changes every few hours. On an iPhone/iPad, tap the link below. In
              Google Calendar, go to Settings → Add calendar → From URL and paste the link.
            </p>
            {feedToken ? (
              <>
                <a className="chip" href={feedUrlWebcal}>
                  📅 Tap to subscribe (iPhone/iPad)
                </a>{" "}
                <button className="chip" onClick={() => copyFeedLink(feedUrlHttps)}>
                  Copy link for Google Calendar
                </button>
                {copyMsg && <span className="hint"> {copyMsg}</span>}
                <p className="hint" style={{ marginTop: 8 }}>
                  <button className="chip" disabled={regenerating} onClick={regenerateFeedLink}>
                    {regenerating ? "Generating…" : "Get a new link"}
                  </button>{" "}
                  if this one&apos;s ever shared somewhere you didn&apos;t mean it to be.
                </p>
              </>
            ) : feedTokenLoaded ? (
              <p className="hint">
                <button className="chip" disabled={regenerating} onClick={setNewFeedToken}>
                  {regenerating ? "Generating…" : "Set up a link"}
                </button>
              </p>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <button
            className="chip"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setShowFilters((v) => !v)}
          >
            🔍 Filter{categoryFilter.length + peopleFilter.length > 0 ? ` (${categoryFilter.length + peopleFilter.length})` : ""}
            {showFilters ? " ▲" : " ▼"}
          </button>
          {(categoryFilter.length > 0 || peopleFilter.length > 0) && (
            <button
              className="chip"
              onClick={() => {
                setCategoryFilter([]);
                setPeopleFilter([]);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {showFilters && (
          <>
            <p className="hint">Show just one type of thing (e.g. training coming up), just one person, or a few people together.</p>
            <b style={{ display: "block", fontSize: 13 }}>Type</b>
            <div className="chips">
              {REMINDER_CATEGORIES.map(([k, l]) => (
                <button
                  key={k}
                  className={`chip${categoryFilter.includes(k) ? " on" : ""}`}
                  onClick={() => toggleFilter(categoryFilter, setCategoryFilter, k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <b style={{ display: "block", fontSize: 13, marginTop: 8 }}>Who</b>
            <div className="chips">
              {personOptions.map((o) => (
                <button
                  key={o.name}
                  className={`chip${peopleFilter.includes(o.name) ? " on" : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => toggleFilter(peopleFilter, setPeopleFilter, o.name)}
                >
                  <PersonDot name={o.name} />
                  {o.kind === "adult" ? "🧑 " : ""}
                  {o.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="calendar-top-grid">
      {selected && (
        <div className="card">
          <h3>
            {new Date(selected + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayItems.length === 0 && <p className="empty">Nothing on this day.</p>}
          {dayItems.map((r) =>
            editingId === r.id && editDraft ? (
              <div key={r.id} className="item" style={{ border: "2px solid var(--pine)", marginBottom: 10 }}>
                <b style={{ display: "block", color: "var(--pine)", marginBottom: 6, fontSize: 13 }}>✏️ Editing this entry</b>
                <input value={editDraft.text} onChange={(e) => setEditDraft({ ...editDraft, text: e.target.value })} />
                <div className="row" style={{ marginTop: 6 }}>
                  <input
                    type="date"
                    style={{ flex: "0 0 150px" }}
                    value={editDraft.date}
                    onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                  />
                  <select value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}>
                    {REMINDER_CATEGORIES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
                  <span className="muted" style={{ flex: "0 0 auto" }}>
                    Time (optional)
                  </span>
                  <input
                    type="time"
                    style={{ flex: "0 0 110px" }}
                    value={editDraft.time_from}
                    onChange={(e) => setEditDraft({ ...editDraft, time_from: e.target.value })}
                  />
                  <span className="muted" style={{ flex: "0 0 auto" }}>
                    to
                  </span>
                  <input
                    type="time"
                    style={{ flex: "0 0 110px" }}
                    value={editDraft.time_to}
                    onChange={(e) => setEditDraft({ ...editDraft, time_to: e.target.value })}
                  />
                </div>
                <PeoplePicker options={personOptions} selected={editDraft.people} onChange={(v) => setEditDraft({ ...editDraft, people: v })} />
                <input
                  type="number"
                  step="0.01"
                  placeholder="£ if a payment"
                  style={{ marginTop: 6 }}
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                />
                {editRecordDraft && (
                  <>
                    <p className="hint" style={{ margin: "6px 0 0" }}>
                      This also updates the linked entry in Entries/Expenses.
                    </p>
                    <div className="row" style={{ marginTop: 4 }}>
                      <input
                        type="time"
                        value={editRecordDraft.time_from}
                        onChange={(e) => setEditRecordDraft({ ...editRecordDraft, time_from: e.target.value })}
                      />
                      <input
                        type="time"
                        value={editRecordDraft.time_to}
                        onChange={(e) => setEditRecordDraft({ ...editRecordDraft, time_to: e.target.value })}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.25"
                        placeholder="or hrs"
                        style={{ flex: "0 0 70px" }}
                        value={editRecordDraft.hours}
                        onChange={(e) => setEditRecordDraft({ ...editRecordDraft, hours: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div style={{ marginTop: 6 }}>
                  <button className="chip" onClick={() => saveEdit(r.id)}>
                    Save
                  </button>{" "}
                  <button
                    className="chip"
                    onClick={() => {
                      setEditingId(null);
                      setEditRecordDraft(null);
                    }}
                  >
                    Cancel
                  </button>{" "}
                  <button className="chip" onClick={() => deleteOne(r)}>
                    Delete
                  </button>
                  {r.series_id && (
                    <>
                      {" "}
                      <button className="chip" onClick={() => stopRepeating(r)}>
                        Stop repeating (this & future)
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : r.id.startsWith(F2F_PREFIX) ? (
              <Link key={r.id} href="/dashboard/training" className="day-item">
                <span className="day-item-icon">{reminderCategoryIcon(r.category)}</span>
                <span className="day-item-body">
                  <span className="day-item-title">{r.text}</span>
                  <span className="day-item-meta">
                    <span>{reminderCategoryText(r.category)}</span>
                  </span>
                </span>
              </Link>
            ) : r.id.startsWith(CLUB_PREFIX) ? (
              <Link
                key={r.id}
                href={`/dashboard/about?person=${encodeURIComponent(r.people[0] || "")}&open=clubs`}
                className="day-item"
              >
                <span className="day-item-icon">{reminderCategoryIcon(r.category)}</span>
                <span className="day-item-body">
                  <span className="day-item-title">
                    {r.text} <span className="day-item-recur" title="Repeats every week">🔁</span>
                  </span>
                  <span className="day-item-meta">
                    <span>{reminderCategoryText(r.category)}</span>
                    {r.time_from && <span>{r.time_from.slice(0, 5)}{r.time_to ? `–${r.time_to.slice(0, 5)}` : ""}</span>}
                    <PersonTags people={r.people} />
                  </span>
                </span>
              </Link>
            ) : (
              <div key={r.id} className={`day-item${r.done ? " done" : ""}`}>
                <span className="day-item-icon">{reminderCategoryIcon(r.category)}</span>
                <div className="day-item-body" onClick={() => startEdit(r)}>
                  <div className="day-item-title">
                    {r.text}
                    {r.series_id ? <span className="day-item-recur" title="Repeats"> 🔁</span> : ""}
                  </div>
                  <div className="day-item-meta">
                    <span>{reminderCategoryText(r.category)}</span>
                    {r.time_from && <span>{r.time_from.slice(0, 5)}{r.time_to ? `–${r.time_to.slice(0, 5)}` : ""}</span>}
                    <PersonTags people={r.people} />
                    {r.amount != null ? <span>£{Number(r.amount).toFixed(2)}</span> : ""}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        🔗 Link
                      </a>
                    )}
                    {r.done ? <span>Done</span> : ""}
                    {authorOf(r.user_id) && <span className="badge-author">by {authorOf(r.user_id)}</span>}
                    {authorOf(r.edited_by) && r.edited_by !== r.user_id && (
                      <span className="badge-author">edited by {authorOf(r.edited_by)}</span>
                    )}
                  </div>
                  {showSourceFor === r.id && r.source_text && (
                    <p className="note" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                      {r.source_text}
                    </p>
                  )}
                </div>
                <div className="day-item-actions">
                  {r.source_text && (
                    <button
                      className="chip"
                      title="Show the original email this came from"
                      onClick={() => setShowSourceFor(showSourceFor === r.id ? null : r.id)}
                    >
                      ℹ️
                    </button>
                  )}
                  <button className="chip" onClick={() => toggleDone(r)}>
                    {r.done ? "Undo" : "Done"}
                  </button>
                </div>
              </div>
            ),
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            Tap anything above to edit it.
          </p>
          {adding ? (
            <div style={{ marginTop: 8 }}>
              <input placeholder="What is it?" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
              <div className="row" style={{ marginTop: 6 }}>
                <input type="date" style={{ flex: "0 0 150px" }} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {REMINDER_CATEGORIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
                <span className="muted" style={{ flex: "0 0 auto" }}>
                  Time (optional)
                </span>
                <input type="time" style={{ flex: "0 0 110px" }} value={draft.time_from} onChange={(e) => setDraft({ ...draft, time_from: e.target.value })} />
                <span className="muted" style={{ flex: "0 0 auto" }}>
                  to
                </span>
                <input type="time" style={{ flex: "0 0 110px" }} value={draft.time_to} onChange={(e) => setDraft({ ...draft, time_to: e.target.value })} />
              </div>
              <PeoplePicker options={personOptions} selected={draft.people} onChange={(v) => setDraft({ ...draft, people: v })} />
              <input
                type="number"
                step="0.01"
                placeholder="£ if a payment"
                style={{ marginTop: 6 }}
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
              <div className="row" style={{ marginTop: 6 }}>
                <select
                  value={repeat}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRepeat(val);
                    // "Until" defaulted to the start date itself is indistinguishable from
                    // "just this once" -- occurrenceDates() stops as soon as the next date
                    // would be after "until", so it never generated a second occurrence.
                    // Bump it forward whenever repeat is turned on and it hasn't already
                    // been set to something meaningfully later than the start date.
                    if (val !== "none" && until <= draft.date) setUntil(addDays(draft.date, 12 * 7));
                  }}
                >
                  {REPEAT_OPTIONS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {repeat !== "none" && (
                  <input type="date" style={{ flex: "0 0 150px" }} value={until} onChange={(e) => setUntil(e.target.value)} />
                )}
              </div>
              <button className="chip" style={{ marginTop: 6 }} onClick={addReminder}>
                Add
              </button>{" "}
              <button className="x" onClick={() => setAdding(false)}>
                ×
              </button>
            </div>
          ) : (
            <button
              className="chip add"
              style={{ marginTop: 8 }}
              onClick={() => {
                setDraft(emptyDraft(selected));
                setUntil(addDays(selected, 12 * 7));
                setAdding(true);
              }}
            >
              + Add an entry
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>📧 Paste an email</h3>
        <p className="note">
          Paste a whole email from school, a club, Surrey or anywhere else — dates, payments and events get pulled
          out for you to check over before anything&apos;s added.
        </p>
        <textarea
          rows={6}
          placeholder="Paste the email text here…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button className="chip" disabled={extracting || !pasteText.trim()} onClick={extractFromPaste}>
          {extracting ? "Reading…" : "Extract"}
        </button>
        {extractError && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 6 }}>{extractError}</p>}
        {extracted.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <b>Found {extracted.length} thing{extracted.length > 1 ? "s" : ""} — check before adding</b>
              {extracted.length > 1 && (
                <button className="chip" onClick={() => commitExtracted(extracted)}>
                  Add all
                </button>
              )}
            </div>
            {extracted.map((it) => (
              <div key={it._k} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
                <input value={it.text} onChange={(e) => updateExtracted(it._k, { text: e.target.value })} />
                <div className="row" style={{ marginTop: 6 }}>
                  <input
                    type="date"
                    style={{ flex: "0 0 150px" }}
                    value={it.date}
                    onChange={(e) => updateExtracted(it._k, { date: e.target.value })}
                  />
                  <select value={it.category} onChange={(e) => updateExtracted(it._k, { category: e.target.value })}>
                    {REMINDER_CATEGORIES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
                  <span className="muted" style={{ flex: "0 0 auto" }}>
                    Time (optional)
                  </span>
                  <input
                    type="time"
                    style={{ flex: "0 0 110px" }}
                    value={it.timeFrom ?? ""}
                    onChange={(e) => updateExtracted(it._k, { timeFrom: e.target.value || null })}
                  />
                  <span className="muted" style={{ flex: "0 0 auto" }}>
                    to
                  </span>
                  <input
                    type="time"
                    style={{ flex: "0 0 110px" }}
                    value={it.timeTo ?? ""}
                    onChange={(e) => updateExtracted(it._k, { timeTo: e.target.value || null })}
                  />
                </div>
                <PeoplePicker
                  options={personOptions}
                  selected={it.people}
                  onChange={(v) => updateExtracted(it._k, { people: v })}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="£ if a payment"
                  style={{ marginTop: 6 }}
                  value={it.amount ?? ""}
                  onChange={(e) => updateExtracted(it._k, { amount: e.target.value ? Number(e.target.value) : null })}
                />
                <input
                  placeholder="Link (e.g. where to RSVP/pay) — paste one in if it wasn't picked up"
                  style={{ marginTop: 6 }}
                  value={it.url ?? ""}
                  onChange={(e) => updateExtracted(it._k, { url: e.target.value.trim() || null })}
                />
                {it.repeat !== "none" && (
                  <p className="hint" style={{ marginTop: 4 }}>
                    🔁 Looks recurring ({it.repeat}) until {it.until}
                  </p>
                )}
                <button className="chip" style={{ marginTop: 6 }} onClick={() => commitExtracted([it])}>
                  Add to calendar
                </button>{" "}
                <button className="chip" onClick={() => discardExtracted(it._k)}>
                  Discard
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <button className="chip" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <h3 style={{ margin: 0 }}>{monthLabel(year, month)}</h3>
          <button className="chip" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <button className="chip" style={{ marginTop: 6 }} onClick={goToday}>
          Today
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 10 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="muted" style={{ textAlign: "center", fontSize: 12 }}>
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const iso = isoOf(year, month, day);
            const items = byDate[iso] ?? [];
            const isToday = iso === t;
            const isSelected = iso === selected;
            return (
              <div
                key={i}
                onClick={() => setSelected(iso)}
                style={{
                  minHeight: 52,
                  padding: 4,
                  borderRadius: 6,
                  cursor: "pointer",
                  border: isSelected ? "2px solid var(--marker)" : isToday ? "1px solid var(--marker)" : "1px solid #eee",
                  background: isSelected ? "var(--marker-bg, #fff7e6)" : undefined,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400 }}>{day}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                  {items.slice(0, 6).map((it) => (
                    <span
                      key={it.id}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        display: "inline-block",
                        background: it.people[0] ? personColor(it.people[0]) : "var(--marker)",
                        opacity: it.done ? 0.35 : 1,
                      }}
                    />
                  ))}
                  {items.length > 6 && (
                    <small className="muted" style={{ fontSize: 10 }}>
                      +{items.length - 6}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove this reminder?"
          itemLabel={pendingDelete.text}
          alsoRemoves={pendingDeleteHasRecord ? ["Entries / Expenses"] : []}
          confirmLabel={pendingDeleteHasRecord ? "Delete both" : "Remove"}
          secondaryLabel={pendingDeleteHasRecord ? "Remove this, keep entry" : undefined}
          onSecondary={pendingDeleteHasRecord ? () => confirmDeleteOne(true) : undefined}
          onConfirm={() => confirmDeleteOne(false)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
