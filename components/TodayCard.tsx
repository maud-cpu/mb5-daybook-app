"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES, REPEAT_OPTIONS, Reminder, reminderCategoryLabel } from "@/lib/types";
import { fmtDate, occurrenceDates } from "@/lib/calendarHelpers";

function inNextDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Draft = { text: string; date: string; category: string; child: string; amount: string };

function draftFrom(r: Reminder): Draft {
  return { text: r.text, date: r.date, category: r.category, child: r.child, amount: r.amount != null ? String(r.amount) : "" };
}

export default function TodayCard() {
  const supabase = createClient();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [childNames, setChildNames] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<string>(REMINDER_CATEGORIES[0][0]);
  const [child, setChild] = useState("");
  const [amount, setAmount] = useState("");
  const [repeat, setRepeat] = useState<string>("none");
  const [until, setUntil] = useState(inNextDays(12 * 7));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [{ data: rem }, { data: kids }] = await Promise.all([
      supabase.from("reminders").select("*").eq("done", false).order("date"),
      supabase.from("children").select("name").order("name"),
    ]);
    setReminders((rem as Reminder[]) ?? []);
    setChildNames(((kids as { name: string }[] | null) ?? []).map((c) => c.name));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addReminder() {
    if (!text.trim() || !date) return;
    const base = { text: text.trim(), category, child, amount: amount ? Number(amount) : null };
    if (repeat === "none") {
      await supabase.from("reminders").insert({ ...base, date });
    } else {
      const dates = occurrenceDates(date, until, repeat);
      const seriesId = crypto.randomUUID();
      await supabase.from("reminders").insert(dates.map((d) => ({ ...base, date: d, series_id: seriesId })));
    }
    setText("");
    setAmount("");
    setChild("");
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
      child: editDraft.child,
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
    );
  }

  function Row({ r }: { r: Reminder }) {
    if (editingId === r.id) return <EditRow r={r} />;
    return (
      <div className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ cursor: "pointer" }} onClick={() => startEdit(r)}>
          {reminderCategoryLabel(r.category)} {r.text}
          {r.series_id ? " 🔁" : ""}
          {r.child ? ` · ${r.child}` : ""}
          {r.amount != null ? ` · £${Number(r.amount).toFixed(2)}` : ""}
          {r.date !== t && <small className="muted"> — {fmtDate(r.date)}</small>}
        </span>
        <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => markDone(r.id)}>
          Done
        </button>
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
          <div className="row" style={{ marginTop: 6 }}>
            <select value={child} onChange={(e) => setChild(e.target.value)}>
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
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
