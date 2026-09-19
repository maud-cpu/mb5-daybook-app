"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES, Reminder, reminderCategoryLabel } from "@/lib/types";

function inNextDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
    await supabase.from("reminders").insert({
      text: text.trim(),
      date,
      category,
      child,
      amount: amount ? Number(amount) : null,
    });
    setText("");
    setAmount("");
    setChild("");
    setAdding(false);
    load();
  }

  async function markDone(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("reminders").update({ done: true, done_at: new Date().toISOString() }).eq("id", id);
  }

  if (!loaded) return null;

  const t = today();
  const weekAhead = inNextDays(7);
  const todays = reminders.filter((r) => r.date === t);
  const upcoming = reminders.filter((r) => r.date > t && r.date <= weekAhead);

  function Row({ r }: { r: Reminder }) {
    return (
      <div className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span>
          {reminderCategoryLabel(r.category)} {r.text}
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
