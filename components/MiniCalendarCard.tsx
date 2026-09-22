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

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", margin: "0 0 4px" }}>
        <button className="chip" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ margin: 0 }}>📅 This week</h3>
          <small className="muted">{fmtRange(days[0], days[6])}</small>
        </div>
        <button className="chip" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          ›
        </button>
      </div>
      {!isCurrentWeek && (
        <p style={{ textAlign: "center", margin: "0 0 8px" }}>
          <button className="chip" style={{ margin: 0 }} onClick={() => setWeekStart(weekStartOf(t))}>
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
            gap: 8,
            overflowX: "auto",
            scrollSnapType: "x proximity",
            paddingBottom: 4,
            marginTop: 8,
          }}
        >
          {days.map((iso) => {
            const items = byDate[iso] ?? [];
            const isToday = iso === t;
            const weekdayLabel = new Date(iso + "T12:00").toLocaleDateString("en-GB", { weekday: "short" });
            return (
              <div
                key={iso}
                style={{
                  flex: "0 0 106px",
                  scrollSnapAlign: "start",
                  border: isToday ? "2px solid var(--marker)" : "1.5px solid var(--line)",
                  background: isToday ? "var(--marker-bg)" : "#fbfaf6",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {weekdayLabel}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: isToday ? 800 : 600, color: isToday ? "var(--pine)" : "var(--ink)" }}>
                    {fmtDayNum(iso)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 20 }}>
                  {items.length === 0 ? (
                    <div className="muted" style={{ fontSize: 10.5, textAlign: "center", opacity: 0.55 }}>
                      —
                    </div>
                  ) : (
                    <>
                      {items.slice(0, 3).map((it, idx) => (
                        <div
                          key={idx}
                          title={it.text}
                          style={{
                            background: it.color,
                            color: "#fff",
                            borderRadius: 7,
                            padding: "3px 5px",
                            fontSize: 10.5,
                            fontWeight: 600,
                            lineHeight: 1.25,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.icon} {it.text}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="muted" style={{ fontSize: 10, textAlign: "center" }}>
                          +{items.length - 3} more
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
        <Link href="/dashboard/calendar">Open full calendar ↗</Link>
      </p>
    </div>
  );
}
