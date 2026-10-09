"use client";

import { useEffect, useState } from "react";
import { nextOccurrences } from "@/lib/calendarHelpers";
import { today } from "@/lib/domain";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Club = {
  id: string;
  child_id: string;
  club_name: string;
  weekday: number;
  time_from: string;
  time_to: string;
  cost: string;
  website: string;
  contact_name: string;
  contact_info: string;
  notes: string;
  skip_dates: string[];
};

function fmtShort(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ChildClubs({ childId }: { childId: string }) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [skipWeeksDraft, setSkipWeeksDraft] = useState<Record<string, string>>({});

  async function load() {
    setLoaded(false);
    const { clubs: allClubs, error: err } = await fetch("/api/child-clubs").then((r) => r.json());
    if (err) setError(err);
    setClubs(
      ((allClubs as Club[]) ?? []).filter((c) => c.child_id === childId).map((c) => ({ ...c, skip_dates: c.skip_dates ?? [] })),
    );
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this child's clubs on mount / when childId changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function addClub() {
    setError("");
    const res = await fetch("/api/child-clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ child_id: childId, club_name: "", weekday: 0 }] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "unknown error");
      return;
    }
    load();
  }

  async function updateClub(id: string, patch: Partial<Club>) {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const res = await fetch("/api/child-clubs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "unknown error");
    }
  }

  async function removeClub(id: string) {
    if (!confirm("Remove this club?")) return;
    setClubs((prev) => prev.filter((c) => c.id !== id));
    const res = await fetch(`/api/child-clubs?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "unknown error");
    }
  }

  // Appended to whatever's already there (deduped), with anything already
  // past dropped -- so this list doesn't just grow forever with old half-
  // terms nobody will ever look at again.
  function skipNextOccurrences(club: Club, weeks: number) {
    if (!weeks || weeks < 1) return;
    const upcoming = nextOccurrences(club.weekday, today(), weeks);
    const merged = [...new Set([...club.skip_dates.filter((d) => d >= today()), ...upcoming])].sort();
    updateClub(club.id, { skip_dates: merged });
  }

  function unskipDate(club: Club, date: string) {
    updateClub(club.id, { skip_dates: club.skip_dates.filter((d) => d !== date) });
  }

  if (!loaded) return <p className="hint">Loading…</p>;

  const todayIso = today();

  return (
    <div style={{ marginTop: 8 }}>
      <p className="hint">
        Shows up automatically on the calendar every week on the day you set — no need to add it separately as a
        reminder. Also pulled into the Handover document.
      </p>
      {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>Couldn&apos;t save: {error}</p>}
      {clubs.map((c) => (
        <div className="item" key={c.id}>
          <div className="row">
            <input
              placeholder="Club name"
              defaultValue={c.club_name}
              onBlur={(e) => updateClub(c.id, { club_name: e.target.value })}
            />
            <button className="x" onClick={() => removeClub(c.id)}>
              ×
            </button>
          </div>
          <div className="row">
            <select value={c.weekday} onChange={(e) => updateClub(c.id, { weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              style={{ flex: "0 0 110px" }}
              value={c.time_from}
              onChange={(e) => updateClub(c.id, { time_from: e.target.value })}
            />
            <input
              type="time"
              style={{ flex: "0 0 110px" }}
              value={c.time_to}
              onChange={(e) => updateClub(c.id, { time_to: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              placeholder="Cost (e.g. £5/session)"
              defaultValue={c.cost}
              onBlur={(e) => updateClub(c.id, { cost: e.target.value })}
            />
            <input placeholder="Website" defaultValue={c.website} onBlur={(e) => updateClub(c.id, { website: e.target.value })} />
          </div>
          <div className="row">
            <input
              placeholder="Main contact name"
              defaultValue={c.contact_name}
              onBlur={(e) => updateClub(c.id, { contact_name: e.target.value })}
            />
            <input
              placeholder="Contact phone/email"
              defaultValue={c.contact_info}
              onBlur={(e) => updateClub(c.id, { contact_info: e.target.value })}
            />
          </div>
          <textarea
            placeholder="Notes (e.g. what to bring, term dates)"
            defaultValue={c.notes}
            onBlur={(e) => updateClub(c.id, { notes: e.target.value })}
          />
          <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
            <span className="hint" style={{ flex: "0 0 auto" }}>
              Skip the next
            </span>
            <input
              type="number"
              min={1}
              style={{ flex: "0 0 60px" }}
              placeholder="3"
              value={skipWeeksDraft[c.id] ?? ""}
              onChange={(e) => setSkipWeeksDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
            />
            <span className="hint" style={{ flex: "0 0 auto" }}>
              session{Number(skipWeeksDraft[c.id]) === 1 ? "" : "s"} (e.g. half term)
            </span>
            <button
              className="chip"
              style={{ flex: "0 0 auto" }}
              onClick={() => {
                skipNextOccurrences(c, Number(skipWeeksDraft[c.id]));
                setSkipWeeksDraft((prev) => ({ ...prev, [c.id]: "" }));
              }}
            >
              Apply
            </button>
          </div>
          {c.skip_dates.filter((d) => d >= todayIso).length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>
              {c.skip_dates
                .filter((d) => d >= todayIso)
                .sort()
                .map((d) => (
                  <button key={d} className="chip" title="Tap to undo -- this date will show again" onClick={() => unskipDate(c, d)}>
                    Off {fmtShort(d)} ✕
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      <button className="chip add" onClick={addClub}>
        + add a club
      </button>
    </div>
  );
}
