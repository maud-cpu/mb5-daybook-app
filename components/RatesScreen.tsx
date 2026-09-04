"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gbp, today } from "@/lib/domain";
import { BANDS, Rates } from "@/lib/types";

type RotaRow = { date: string; name: string; phone: string };

export default function RatesScreen() {
  const supabase = createClient();
  const [rates, setRates] = useState<Rates | null>(null);
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [rescanMsg, setRescanMsg] = useState("");
  const [rescanning, setRescanning] = useState(false);

  async function rescan() {
    setRescanning(true);
    setRescanMsg("");
    const res = await fetch("/api/rescan", { method: "POST" });
    const data = await res.json();
    setRescanning(false);
    setRescanMsg(
      res.ok ? (data.changed ? `${data.changed} entr${data.changed === 1 ? "y" : "ies"} updated` : "Nothing new to flag") : data.error || "Couldn't rescan",
    );
  }

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: rt }] = await Promise.all([
        supabase.from("shared_rates").select("*").single(),
        supabase.from("shared_rota").select("date, name, phone").order("date"),
      ]);
      setRates(r as Rates);
      setRota((rt as RotaRow[]) ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tonight = rota.find((r) => r.date === today());

  if (!rates) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="card" style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 22 }}>📞</span>
        <div>
          <b>Out of hours tonight</b>
          <br />
          {tonight ? (
            <>
              {tonight.name} — <a href={`tel:${tonight.phone.replace(/\s/g, "")}`}>{tonight.phone}</a>
            </>
          ) : (
            <span className="muted">No rota loaded for today — ask your admin to add it.</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Rates — {rates.label}</h3>
        <p>Mileage: {gbp(rates.mileage)}/mile ({rates.daily_deduct} miles deducted per day)</p>
        <p>Day care under 5 hours: {gbp(rates.hour_first)}/hr first child, {gbp(rates.hour_add)}/hr additional child</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th align="left">Age band</th>
              <th align="left">Day (5+ hrs) first</th>
              <th align="left">Day (5+ hrs) additional</th>
              <th align="left">Overnight (first)</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                <td>{gbp(rates.day_first[b])}</td>
                <td>{gbp(rates.day_add[b])}</td>
                <td>{gbp(rates.overnight[b])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>
          Additional children overnight are costed at 80% of the first-child rate. Siblings sharing a household are
          priced as a family — the eldest gets the first-child rate, the rest get the additional-child rate.
        </p>
        <p className="hint">This is set by your admin and applies to everyone.</p>
      </div>

      <div className="card">
        <h3>Follow-ups</h3>
        <p className="hint">
          If a safeguarding check gets improved, this re-checks all your past entries so nothing gets missed.
        </p>
        <button className="chip" onClick={rescan} disabled={rescanning}>
          {rescanning ? "Rescanning…" : "Rescan entries for follow-ups"}
        </button>
        {rescanMsg && <p className="hint">{rescanMsg}</p>}
      </div>
    </div>
  );
}
