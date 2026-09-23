"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES, reminderCategoryLabel } from "@/lib/types";
import { addDays, clubText, groupClubsByOccurrence, mondayStartWeekday, personColor } from "@/lib/calendarHelpers";
import PeoplePicker, { PersonOption } from "@/components/PeoplePicker";

// id is null for a virtual club occurrence -- synthesised fresh every load
// (see CalendarScreen's own CLUB_PREFIX for why), so there's no real row to
// edit or delete here; that's done from About us instead, same as the full
// Calendar tab treats it.
type DayItem = { id: string | null; text: string; color: string; icon: string; category: string; people: string[] };

type Draft = { text: string; category: string; people: string[] };
const emptyDraft = (): Draft => ({ text: "", category: REMINDER_CATEGORIES[0][0], people: [] });

function categoryIcon(category: string): string {
  return reminderCategoryLabel(category).split(" ")[0] || "📌";
}

function weekStartOf(iso: string): string {
  return addDays(iso, -mondayStartWeekday(iso));
}

function fmtDayNum(iso: string): number {
  return Number(iso.slice(8, 10));
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + "T12:00");
  const e = new Date(end + "T12:00");
  const sameMonth = s.getMonth() === e.getMonth();
  const from = s.toLocaleDateString("en-GB", { day: "numeric", month: sameMonth ? undefined : "short" });
  const to = e.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${to}`;
}

export default function MiniCalendarCard() {
  const supabase = createClient();
  const t = today();
  const [weekStart, setWeekStart] = useState(weekStartOf(t));
  const [byDate, setByDate] = useState<Record<string, DayItem[]>>({});
  const [personOptions, setPersonOptions] = useState<PersonOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(t);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  async function load() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const from = days[0];
    const to = days[6];
    const [{ data: rem }, { data: kids }, { data: hhKids }, { data: adults }, { data: clubs }] = await Promise.all([
      supabase.from("reminders").select("id, date, text, people, category").gte("date", from).lte("date", to).eq("done", false),
      supabase.from("children").select("id, name"),
      supabase.from("household_children").select("id, name"),
      supabase.from("household_adults").select("name"),
      supabase.from("child_clubs").select("id, child_id, club_name, weekday, time_from, time_to"),
    ]);

    const childNameById: Record<string, string> = {};
    ((kids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    ((hhKids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));

    const map: Record<string, DayItem[]> = {};
    ((rem as { id: string; date: string; text: string; people: string[]; category: string }[] | null) ?? []).forEach((r) => {
      (map[r.date] ||= []).push({
        id: r.id,
        text: r.text,
        color: r.people.length ? personColor(r.people.join(" & ")) : "var(--accent)",
        icon: categoryIcon(r.category),
        category: r.category,
        people: r.people,
      });
    });
    const clubRows = (clubs ?? []) as { id: string; child_id: string; club_name: string; weekday: number; time_from: string; time_to: string }[];
    groupClubsByOccurrence(clubRows, childNameById).forEach((c) => {
      const base = clubText(c.club_name, c.time_from, c.time_to);
      const text = c.childNames.length > 1 ? `${base} (${c.childNames.join(" & ")})` : base;
      days.forEach((iso) => {
        if (mondayStartWeekday(iso) === c.weekday) {
          (map[iso] ||= []).push({ id: null, text, color: personColor(c.childNames.join(" & ")), icon: "🧩", category: "club", people: c.childNames });
        }
      });
    });
    setByDate(map);
    setPersonOptions([
      ...((kids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
      ...((hhKids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, kind: "child" as const })),
      ...((adults as { name: string }[] | null) ?? []).map((a) => ({ name: a.name, kind: "adult" as const })),
    ]);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-load whenever the visible week changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isCurrentWeek = weekStart === weekStartOf(t);

  function closeForms() {
    setAdding(false);
    setEditingId(null);
  }

  function changeWeek(newStart: string) {
    setWeekStart(newStart);
    // Keep "today" selected when today is in view; otherwise land on the
    // first day of whichever week just came into view rather than leaving
    // "selected" pointing at a date that's no longer shown.
    setSelected(newStart === weekStartOf(t) ? t : newStart);
    closeForms();
  }

  function selectDay(iso: string) {
    setSelected(iso);
    closeForms();
  }

  function startAdd() {
    setDraft(emptyDraft());
    setEditingId(null);
    setAdding(true);
  }

  function startEdit(it: DayItem) {
    if (!it.id) return;
    setDraft({ text: it.text, category: it.category, people: it.people });
    setAdding(false);
    setEditingId(it.id);
  }

  async function saveAdd() {
    if (!draft.text.trim()) return;
    await supabase.from("reminders").insert({ text: draft.text.trim(), date: selected, category: draft.category, people: draft.people });
    setAdding(false);
    load();
  }

  async function saveEdit() {
    if (!editingId || !draft.text.trim()) return;
    await supabase
      .from("reminders")
      .update({ text: draft.text.trim(), category: draft.category, people: draft.people })
      .eq("id", editingId);
    setEditingId(null);
    load();
  }

  async function deleteEditing() {
    if (!editingId) return;
    if (!confirm("Remove this entry?")) return;
    await supabase.from("reminders").delete().eq("id", editingId);
    setEditingId(null);
    load();
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", margin: "0 0 2px" }}>
        <button className="chip" style={{ padding: "5px 10px", margin: 0 }} onClick={() => changeWeek(addDays(weekStart, -7))}>
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15.5 }}>📅 This week</h3>
          <small className="muted" style={{ fontSize: 11.5 }}>
            {fmtRange(days[0], days[6])}
          </small>
        </div>
        <button className="chip" style={{ padding: "5px 10px", margin: 0 }} onClick={() => changeWeek(addDays(weekStart, 7))}>
          ›
        </button>
      </div>
      {!isCurrentWeek && (
        <p style={{ textAlign: "center", margin: "4px 0 0" }}>
          <button className="chip" style={{ margin: 0, padding: "4px 10px", fontSize: 12 }} onClick={() => changeWeek(weekStartOf(t))}>
            Back to this week
          </button>
        </p>
      )}

      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 5,
            overflowX: "auto",
            scrollSnapType: "x proximity",
            paddingBottom: 2,
            marginTop: 6,
          }}
        >
          {days.map((iso) => {
            const items = byDate[iso] ?? [];
            const isToday = iso === t;
            const isSelected = iso === selected;
            const weekdayLabel = new Date(iso + "T12:00").toLocaleDateString("en-GB", { weekday: "narrow" });
            return (
              <button
                key={iso}
                onClick={() => selectDay(iso)}
                style={{
                  flex: "1 1 0",
                  minWidth: 40,
                  scrollSnapAlign: "start",
                  border: isSelected ? "2px solid var(--pine)" : isToday ? "2px solid var(--marker)" : "1.5px solid var(--line)",
                  background: isSelected ? "var(--pine-soft)" : isToday ? "var(--marker-bg)" : "#fbfaf6",
                  borderRadius: "var(--radius-sm)",
                  padding: "5px 3px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase" }}>
                    {weekdayLabel}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: isToday || isSelected ? 800 : 600, color: isSelected ? "var(--pine)" : isToday ? "var(--pine)" : "var(--ink)" }}>
                    {fmtDayNum(iso)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 8 }}>
                  {items.slice(0, 2).map((it, idx) => (
                    <div
                      key={idx}
                      title={it.text}
                      style={{
                        background: it.color,
                        borderRadius: 5,
                        height: 5,
                        width: "100%",
                      }}
                    />
                  ))}
                  {items.length > 2 && (
                    <div className="muted" style={{ fontSize: 8.5, textAlign: "center" }}>
                      +{items.length - 2}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {(() => {
        const selectedItems = byDate[selected] ?? [];
        const label =
          selected === t
            ? "Today"
            : new Date(selected + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
        return (
          <div style={{ marginTop: 8 }}>
            <small className="muted" style={{ fontWeight: 700 }}>
              {label}
            </small>
            {selectedItems.length === 0 && !adding && (
              <p className="muted" style={{ fontSize: 12.5, margin: "3px 0 0" }}>
                Nothing on this day.
              </p>
            )}
            {selectedItems.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                {selectedItems.map((it, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => startEdit(it)}
                    title={it.id ? "Tap to edit" : "Edited from About us"}
                    style={{
                      background: it.color,
                      color: "#fff",
                      border: "none",
                      borderRadius: 7,
                      padding: "4px 7px",
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "left",
                      cursor: it.id ? "pointer" : "default",
                      font: "inherit",
                    }}
                  >
                    {it.icon} {it.text}
                  </button>
                ))}
              </div>
            )}

            {editingId ? (
              <div style={{ marginTop: 8, padding: 8, background: "#fbfaf6", borderRadius: "var(--radius-sm)" }}>
                <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="What is it?" />
                <select
                  style={{ marginTop: 6 }}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {REMINDER_CATEGORIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <PeoplePicker options={personOptions} selected={draft.people} onChange={(v) => setDraft({ ...draft, people: v })} />
                <div style={{ marginTop: 6 }}>
                  <button className="chip" onClick={saveEdit}>
                    Save
                  </button>{" "}
                  <button className="chip" onClick={closeForms}>
                    Cancel
                  </button>{" "}
                  <button className="chip" onClick={deleteEditing}>
                    Delete
                  </button>
                </div>
              </div>
            ) : adding ? (
              <div style={{ marginTop: 8, padding: 8, background: "#fbfaf6", borderRadius: "var(--radius-sm)" }}>
                <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="What is it?" autoFocus />
                <select
                  style={{ marginTop: 6 }}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {REMINDER_CATEGORIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <PeoplePicker options={personOptions} selected={draft.people} onChange={(v) => setDraft({ ...draft, people: v })} />
                <div style={{ marginTop: 6 }}>
                  <button className="chip" onClick={saveAdd}>
                    Add
                  </button>{" "}
                  <button className="chip" onClick={closeForms}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="chip add" style={{ marginTop: 6 }} onClick={startAdd}>
                + Add an entry
              </button>
            )}
          </div>
        );
      })()}

      <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
        <Link href="/dashboard/calendar">Open full calendar ↗</Link>
      </p>
    </div>
  );
}
