"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES, REPEAT_OPTIONS, Reminder, reminderCategoryLabel } from "@/lib/types";
import { addDays, fmtDate, occurrenceDates } from "@/lib/calendarHelpers";
import PeoplePicker, { PersonOption } from "@/components/PeoplePicker";
import PersonTags from "@/components/PersonTags";

// A face-to-face training session (from the Training tab) isn't a real row in
// the reminders table -- it's read-only here and just merged into the same
// list so "what's on today/this week" is a single glance, not two places to
// check. Marked by this id prefix rather than a real category.
const F2F_PREFIX = "f2f:";
function f2fReminder(id: string, text: string, date: string): Reminder {
  return {
    id: F2F_PREFIX + id,
    text,
    date,
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

function inNextDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Draft = { text: string; date: string; category: string; people: string[]; amount: string };

function draftFrom(r: Reminder): Draft {
  return { text: r.text, date: r.date, category: r.category, people: r.people, amount: r.amount != null ? String(r.amount) : "" };
}

export default function TodayCard() {
  const supabase = createClient();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<string>(REMINDER_CATEGORIES[0][0]);
  const [people, setPeople] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [repeat, setRepeat] = useState<string>("none");
  const [until, setUntil] = useState(inNextDays(12 * 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showSourceFor, setShowSourceFor] = useState<string | null>(null);

  async function load() {
    const [{ data: rem }, { data: kids }, { data: hhKids }, { data: adults }, { data: f2fCourses }, { data: f2fProgress }] =
      await Promise.all([
        supabase.from("reminders").select("*").eq("done", false).order("date"),
        supabase.from("children").select("name").order("name"),
        supabase.from("household_children").select("name").order("name"),
        supabase.from("household_adults").select("name").order("name"),
        supabase.from("shared_training_catalog").select("id, title, session_date").eq("is_face_to_face", true).eq("archived", false),
        supabase.from("training_progress").select("course_title, session_date").not("session_date", "is", null),
      ]);
    const myDateByTitle: Record<string, string> = {};
    (f2fProgress ?? []).forEach((p: { course_title: string; session_date: string | null }) => {
      if (p.session_date) myDateByTitle[p.course_title] = p.session_date;
    });
    const f2fReminders = (f2fCourses ?? [])
      .map((c: { id: string; title: string; session_date: string | null }) => {
        const date = myDateByTitle[c.title] || c.session_date;
        return date ? f2fReminder(c.id, c.title, date) : null;
      })
      .filter((r): r is Reminder => r !== null);
    setReminders([...((rem as Reminder[]) ?? []), ...f2fReminders]);
    setPersonOptions([
      ...((kids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
      ...((hhKids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
      ...((adults as { name: string }[] | null) ?? []).map((a) => ({ name: a.name, kind: "adult" as const })),
    ]);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addReminder() {
    if (!text.trim() || !date) return;
    const base = { text: text.trim(), category, people, amount: amount ? Number(amount) : null };
    if (repeat === "none") {
      await supabase.from("reminders").insert({ ...base, date });
    } else {
      const dates = occurrenceDates(date, until, repeat);
      const seriesId = crypto.randomUUID();
      await supabase.from("reminders").insert(dates.map((d) => ({ ...base, date: d, series_id: seriesId })));
    }
    setText("");
    setAmount("");
    setPeople([]);
    setRepeat("none");
    setAdding(false);
    load();
  }

  async function markDone(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("reminders").update({ done: true, done_at: new Date().toISOString() }).eq("id", id);
  }

  function startEdit(r: Reminder) {
    setEditingId(r.id);
    setEditDraft(draftFrom(r));
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editDraft.text.trim() || !editDraft.date) return;
    const patch = {
      text: editDraft.text.trim(),
      date: editDraft.date,
      category: editDraft.category,
      people: editDraft.people,
      amount: editDraft.amount ? Number(editDraft.amount) : null,
    };
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setEditingId(null);
    setEditDraft(null);
    await supabase.from("reminders").update(patch).eq("id", id);
  }

  async function deleteOne(r: Reminder) {
    if (!confirm(`Remove "${r.text}"?`)) return;
    setReminders((prev) => prev.filter((x) => x.id !== r.id));
    setEditingId(null);
    await supabase.from("reminders").delete().eq("id", r.id);
  }

  async function stopRepeating(r: Reminder) {
    if (!r.series_id) return;
    if (!confirm(`Remove "${r.text}" and every future occurrence? Past/done ones are kept.`)) return;
    setReminders((prev) => prev.filter((x) => !(x.series_id === r.series_id && x.date >= r.date)));
    setEditingId(null);
    await supabase.from("reminders").delete().eq("series_id", r.series_id).eq("done", false).gte("date", r.date);
  }

  if (!loaded) return null;

  const t = today();
  const weekAhead = inNextDays(7);
  const todays = reminders.filter((r) => r.date === t);
  const upcoming = reminders.filter((r) => r.date > t && r.date <= weekAhead);

  function EditRow({ r }: { r: Reminder }) {
    if (!editDraft) return null;
    return (
      <div style={{ marginBottom: 8 }}>
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
        <PeoplePicker options={personOptions} selected={editDraft.people} onChange={(v) => setEditDraft({ ...editDraft, people: v })} />
        <input
          type="number"
          step="0.01"
          placeholder="£ if a payment"
          style={{ marginTop: 6 }}
          value={editDraft.amount}
          onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
        />
        <div style={{ marginTop: 6 }}>
          <button className="chip" onClick={() => saveEdit(r.id)}>
            Save
          </button>{" "}
          <button className="chip" onClick={() => setEditingId(null)}>
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
    );
  }

  function Row({ r }: { r: Reminder }) {
    const isF2F = r.id.startsWith(F2F_PREFIX);
    if (editingId === r.id && !isF2F) return <EditRow r={r} />;
    return (
      <div>
        <div className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          {isF2F ? (
            <Link href="/dashboard/training">
              🎓 {r.text}
              {r.date !== t && <small className="muted"> — {fmtDate(r.date)}</small>}
            </Link>
          ) : (
            <span style={{ cursor: "pointer" }} onClick={() => startEdit(r)}>
              <span className="muted" style={{ fontSize: 12 }}>
                {reminderCategoryLabel(r.category)}
              </span>{" "}
              <b>{r.text}</b>
              {r.series_id ? " 🔁" : ""}
              <PersonTags people={r.people} />
              {r.date !== t && <small className="muted"> — {fmtDate(r.date)}</small>}
            </span>
          )}
          {!isF2F && (
            <span style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
              {r.source_text && (
                <button
                  className="chip"
                  title="Show the original email this came from"
                  onClick={() => setShowSourceFor(showSourceFor === r.id ? null : r.id)}
                >
                  ℹ️
                </button>
              )}
              <button className="chip" onClick={() => markDone(r.id)}>
                Done
              </button>
            </span>
          )}
        </div>
        {showSourceFor === r.id && r.source_text && (
          <p className="note" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
            {r.source_text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h3>📅 Today & coming up</h3>
      {todays.length === 0 && upcoming.length === 0 && (
        <p className="empty">Nothing on the calendar right now — add school, club, Surrey or personal dates below.</p>
      )}
      {todays.length > 0 && (
        <>
          <b style={{ display: "block", marginTop: 4 }}>Today</b>
          {todays.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <b style={{ display: "block", marginTop: 8 }}>Next 7 days</b>
          {upcoming.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        Tap anything above to edit it.
      </p>
      {adding ? (
        <div style={{ marginTop: 8 }}>
          <input placeholder="What is it?" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <input type="date" style={{ flex: "0 0 150px" }} value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {REMINDER_CATEGORIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <PeoplePicker options={personOptions} selected={people} onChange={setPeople} />
          <input
            type="number"
            step="0.01"
            placeholder="£ if a payment"
            style={{ marginTop: 6 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <select
              value={repeat}
              onChange={(e) => {
                const val = e.target.value;
                setRepeat(val);
                // "Until" no later than the start date is indistinguishable from "just
                // this once" -- occurrenceDates() stops before generating a second
                // occurrence. Bump it forward if it hasn't already been set to
                // something meaningfully later than the (possibly just-changed) date.
                if (val !== "none" && until <= date) setUntil(addDays(date, 12 * 7));
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
          {repeat !== "none" && <p className="hint">Repeats {REPEAT_OPTIONS.find(([k]) => k === repeat)?.[1].toLowerCase()} up to and including that date.</p>}
          <button className="chip" style={{ marginTop: 6 }} onClick={addReminder}>
            Add
          </button>{" "}
          <button className="x" onClick={() => setAdding(false)}>
            ×
          </button>
        </div>
      ) : (
        <button className="chip add" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
          + add to calendar
        </button>
      )}
    </div>
  );
}
