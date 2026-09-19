"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES, REPEAT_OPTIONS, Reminder, reminderCategoryLabel } from "@/lib/types";
import { addDays, occurrenceDates } from "@/lib/calendarHelpers";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

type Draft = { text: string; date: string; category: string; child: string; amount: string };
const emptyDraft = (date: string): Draft => ({ text: "", date, category: REMINDER_CATEGORIES[0][0], child: "", amount: "" });

export default function CalendarScreen() {
  const supabase = createClient();
  const t = today();
  const now = new Date(t + "T12:00");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [childNames, setChildNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(t);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(t));
  const [repeat, setRepeat] = useState("none");
  const [until, setUntil] = useState(t);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const from = isoOf(year, month, 1);
    const to = isoOf(year, month, daysInMonth(year, month));
    const [{ data: rem }, { data: kids }, { data: hhKids }] = await Promise.all([
      supabase.from("reminders").select("*").gte("date", from).lte("date", to).order("date"),
      supabase.from("children").select("name").order("name"),
      supabase.from("household_children").select("name").order("name"),
    ]);
    setReminders((rem as Reminder[]) ?? []);
    setChildNames([
      ...((kids as { name: string }[] | null) ?? []).map((c) => c.name),
      ...((hhKids as { name: string }[] | null) ?? []).map((c) => c.name),
    ]);
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

  const byDate: Record<string, Reminder[]> = {};
  reminders.forEach((r) => {
    (byDate[r.date] ||= []).push(r);
  });

  const blanks = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  async function addReminder() {
    if (!draft.text.trim() || !draft.date) return;
    const base = { text: draft.text.trim(), category: draft.category, child: draft.child, amount: draft.amount ? Number(draft.amount) : null };
    if (repeat === "none") {
      await supabase.from("reminders").insert({ ...base, date: draft.date });
    } else {
      const dates = occurrenceDates(draft.date, until, repeat);
      const seriesId = crypto.randomUUID();
      await supabase.from("reminders").insert(dates.map((d) => ({ ...base, date: d, series_id: seriesId })));
    }
    setAdding(false);
    setRepeat("none");
    load();
  }

  async function toggleDone(r: Reminder) {
    const done = !r.done;
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    await supabase.from("reminders").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", r.id);
  }

  function draftFrom(r: Reminder): Draft {
    return { text: r.text, date: r.date, category: r.category, child: r.child, amount: r.amount != null ? String(r.amount) : "" };
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
      child: editDraft.child,
      amount: editDraft.amount ? Number(editDraft.amount) : null,
    };
    setEditingId(null);
    setEditDraft(null);
    await supabase.from("reminders").update(patch).eq("id", id);
    load();
  }

  async function deleteOne(r: Reminder) {
    if (!confirm(`Remove "${r.text}"?`)) return;
    setEditingId(null);
    await supabase.from("reminders").delete().eq("id", r.id);
    load();
  }

  async function stopRepeating(r: Reminder) {
    if (!r.series_id) return;
    if (!confirm(`Remove "${r.text}" and every future occurrence? Past/done ones are kept.`)) return;
    setEditingId(null);
    await supabase.from("reminders").delete().eq("series_id", r.series_id).eq("done", false).gte("date", r.date);
    load();
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  const dayItems = selected ? (byDate[selected] ?? []) : [];

  return (
    <div>
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
                <div style={{ fontSize: 14, lineHeight: 1.1 }}>
                  {items.slice(0, 3).map((it) => (
                    <div key={it.id} style={{ opacity: it.done ? 0.4 : 1 }}>
                      {reminderCategoryLabel(it.category).slice(0, 2)}
                    </div>
                  ))}
                  {items.length > 3 && <small className="muted">+{items.length - 3}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="card">
          <h3>
            {new Date(selected + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayItems.length === 0 && <p className="empty">Nothing on this day.</p>}
          {dayItems.map((r) =>
            editingId === r.id && editDraft ? (
              <div key={r.id} style={{ marginBottom: 10 }}>
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
                <div className="row" style={{ marginTop: 6 }}>
                  <select value={editDraft.child} onChange={(e) => setEditDraft({ ...editDraft, child: e.target.value })}>
                    <option value="">— which child (optional) —</option>
                    {childNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="£ if a payment"
                    style={{ flex: "0 0 130px" }}
                    value={editDraft.amount}
                    onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                  />
                </div>
                <button className="chip" style={{ marginTop: 6 }} onClick={() => saveEdit(r.id)}>
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
            ) : (
              <div
                key={r.id}
                className="rec"
                style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", opacity: r.done ? 0.5 : 1 }}
              >
                <span style={{ cursor: "pointer" }} onClick={() => startEdit(r)}>
                  {reminderCategoryLabel(r.category)} {r.text}
                  {r.series_id ? " 🔁" : ""}
                  {r.child ? ` · ${r.child}` : ""}
                  {r.amount != null ? ` · £${Number(r.amount).toFixed(2)}` : ""}
                  {r.done ? " (done)" : ""}
                </span>
                <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => toggleDone(r)}>
                  {r.done ? "Undo" : "Done"}
                </button>
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
              <div className="row" style={{ marginTop: 6 }}>
                <select value={draft.child} onChange={(e) => setDraft({ ...draft, child: e.target.value })}>
                  <option value="">— which child (optional) —</option>
                  {childNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="£ if a payment"
                  style={{ flex: "0 0 130px" }}
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>
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
              + add to this day
            </button>
          )}
        </div>
      )}
    </div>
  );
}
