"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Club = {
  id: string;
  club_name: string;
  weekday: number;
  time_from: string;
  time_to: string;
  cost: string;
  website: string;
  contact_name: string;
  contact_info: string;
  notes: string;
};

export default function ChildClubs({ childId }: { childId: string }) {
  const supabase = createClient();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoaded(false);
    const { data, error: err } = await supabase.from("child_clubs").select("*").eq("child_id", childId).order("weekday");
    if (err) setError(err.message);
    setClubs((data as Club[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this child's clubs on mount / when childId changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function addClub() {
    setError("");
    const { error: err } = await supabase.from("child_clubs").insert({ child_id: childId, club_name: "", weekday: 0 });
    if (err) {
      setError(err.message);
      return;
    }
    load();
  }

  async function updateClub(id: string, patch: Partial<Club>) {
    setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error: err } = await supabase.from("child_clubs").update(patch).eq("id", id);
    if (err) setError(err.message);
  }

  async function removeClub(id: string) {
    if (!confirm("Remove this club?")) return;
    setClubs((prev) => prev.filter((c) => c.id !== id));
    const { error: err } = await supabase.from("child_clubs").delete().eq("id", id);
    if (err) setError(err.message);
  }

  if (!loaded) return <p className="hint">Loading…</p>;

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
        </div>
      ))}
      <button className="chip add" onClick={addClub}>
        + add a club
      </button>
    </div>
  );
}
