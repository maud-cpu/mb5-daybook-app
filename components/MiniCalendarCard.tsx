"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { clubText, groupClubsByOccurrence, mondayStartWeekday, personColor } from "@/lib/calendarHelpers";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

type DayItem = { text: string; person: string };

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function leadingBlanks(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay();
  return (jsDay + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export default function MiniCalendarCard() {
  const supabase = createClient();
  const t = today();
  const now = new Date(t + "T12:00");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [byDate, setByDate] = useState<Record<string, DayItem[]>>({});
  const [selected, setSelected] = useState<string>(t);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const from = isoOf(year, month, 1);
    const to = isoOf(year, month, daysInMonth(year, month));
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
      (map[r.date] ||= []).push({ text: r.text, person: r.people[0] || "" });
    });
    const clubRows = (clubs ?? []) as { id: string; child_id: string; club_name: string; weekday: number; time_from: string; time_to: string }[];
    groupClubsByOccurrence(clubRows, childNameById).forEach((c) => {
      const base = clubText(c.club_name, c.time_from, c.time_to);
      const text = c.childNames.length > 1 ? `${base} (${c.childNames.join(" & ")})` : base;
      const person = c.childNames.length > 1 ? "" : c.childNames[0];
      for (let d = 1; d <= daysInMonth(year, month); d++) {
        const iso = isoOf(year, month, d);
        if (mondayStartWeekday(iso) === c.weekday) (map[iso] ||= []).push({ text, person });
      }
    });
    setByDate(map);
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

  const blanks = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedItems = byDate[selected] ?? [];

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", margin: "0 0 8px" }}>
        <button className="chip" onClick={() => changeMonth(-1)}>
          ‹
        </button>
        <h3 style={{ margin: 0 }}>📅 {monthLabel(year, month)}</h3>
        <button className="chip" onClick={() => changeMonth(1)}>
          ›
        </button>
      </div>

      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="muted" style={{ textAlign: "center", fontSize: 11 }}>
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
                    minHeight: 30,
                    padding: 2,
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "center",
                    border: isSelected ? "2px solid var(--marker)" : isToday ? "1px solid var(--marker)" : "1px solid transparent",
                    background: isSelected ? "var(--marker-bg)" : undefined,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400 }}>{day}</div>
                  {items.length > 0 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                      {items.slice(0, 3).map((it, idx) => (
                        <span
                          key={idx}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            display: "inline-block",
                            background: it.person ? personColor(it.person) : "var(--marker)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 13.5 }}>
              {new Date(selected + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
            </b>
            {selectedItems.length === 0 ? (
              <p className="muted" style={{ fontSize: 13.5, margin: "4px 0 0" }}>
                Nothing on this day.
              </p>
            ) : (
              selectedItems.map((it, idx) => (
                <div key={idx} className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                  {it.text}
                  {it.person ? ` · ${it.person}` : ""}
                </div>
              ))
            )}
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        <Link href="/dashboard/calendar">Open full calendar ↗</Link>
      </p>
    </div>
  );
}
