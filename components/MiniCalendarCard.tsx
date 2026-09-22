"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { reminderCategoryLabel } from "@/lib/types";
import { addDays, clubText, groupClubsByOccurrence, mondayStartWeekday, personColor } from "@/lib/calendarHelpers";

type DayItem = { text: string; color: string; icon: string };

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
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(t);

  async function load() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const from = days[0];
    const to = days[6];
    const [{ data: rem }, { data: kids }, { data: hhKids }, { data: clubs }] = await Promise.all([
      supabase.from("reminders").select("date, text, people, category").gte("date", from).lte("date", to).eq("done", false),
      supabase.from("children").select("id, name"),
      supabase.from("household_children").select("id, name"),
      supabase.from("child_clubs").select("id, child_id, club_name, weekday, time_from, time_to"),
    ]);

    const childNameById: Record<string, string> = {};
    ((kids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    ((hhKids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));

    const map: Record<string, DayItem[]> = {};
    ((rem as { date: string; text: string; people: string[]; category: string }[] | null) ?? []).forEach((r) => {
      (map[r.date] ||= []).push({
        text: r.text,
        color: r.people.length ? personColor(r.people.join(" & ")) : "var(--accent)",
        icon: categoryIcon(r.category),
      });
    });
    const clubRows = (clubs ?? []) as { id: string; child_id: string; club_name: string; weekday: number; time_from: string; time_to: string }[];
    groupClubsByOccurrence(clubRows, childNameById).forEach((c) => {
      const base = clubText(c.club_name, c.time_from, c.time_to);
      const text = c.childNames.length > 1 ? `${base} (${c.childNames.join(" & ")})` : base;
      days.forEach((iso) => {
        if (mondayStartWeekday(iso) === c.weekday) {
          (map[iso] ||= []).push({ text, color: personColor(c.childNames.join(" & ")), icon: "🧩" });
        }
      });
    });
    setByDate(map);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-load whenever the visible week changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isCurrentWeek = weekStart === weekStartOf(t);

  function changeWeek(newStart: string) {
    setWeekStart(newStart);
    // Keep "today" selected when today is in view; otherwise land on the
    // first day of whichever week just came into view rather than leaving
    // "selected" pointing at a date that's no longer shown.
    setSelected(newStart === weekStartOf(t) ? t : newStart);
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
                onClick={() => setSelected(iso)}
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
            {selectedItems.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, margin: "3px 0 0" }}>
                Nothing on this day.
              </p>
            ) : (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                {selectedItems.slice(0, 4).map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: it.color,
                      color: "#fff",
                      borderRadius: 7,
                      padding: "4px 7px",
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {it.icon} {it.text}
                  </div>
                ))}
              </div>
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
