"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gbp, today } from "@/lib/domain";
import { BANDS, Rates } from "@/lib/types";
import ChangePasswordCard from "@/components/ChangePasswordCard";

type RotaRow = { date: string; name: string; phone: string };

export default function RatesScreen() {
  const supabase = createClient();
  const [rates, setRates] = useState<Rates | null>(null);
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [rescanMsg, setRescanMsg] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [loadError, setLoadError] = useState("");

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
      const [{ data: r, error }, { data: rt }] = await Promise.all([
        supabase.from("shared_rates").select("*").single(),
        supabase.from("shared_rota").select("date, name, phone").order("date"),
      ]);
      if (error) setLoadError(error.message);
      setRates(r as Rates);
      setRota((rt as RotaRow[]) ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tonight = rota.find((r) => r.date === today());

  if (!rates)
    return <p className="muted">{loadError ? `Couldn't load rates: ${loadError}` : "Loading…"}</p>;

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
        <h3>Other allowances — quick reference</h3>
        <p className="note">
          From the Foster Care Finances document, April 2026. Rates here can go out of date — check the full document
          for anything you&apos;re relying on.{" "}
          <a href="/documents/foster-care-finances-april-2026.docx" target="_blank" rel="noopener noreferrer">
            View the full document ↗
          </a>
        </p>

        <details>
          <summary>Weekly age-related allowance</summary>
          <table style={{ width: "100%", marginTop: 6 }}>
            <tbody>
              <tr><td>0–4 years</td><td>£218.08</td></tr>
              <tr><td>5–10 years</td><td>£247.35</td></tr>
              <tr><td>11–13 years</td><td>£329.76</td></tr>
              <tr><td>14–18 years</td><td>£383.12</td></tr>
            </tbody>
          </table>
        </details>

        <details>
          <summary>Pocket money guide (weekly, to give directly to the child)</summary>
          <table style={{ width: "100%", marginTop: 6 }}>
            <tbody>
              <tr><td>5–6 years</td><td>£1–£2</td></tr>
              <tr><td>7–8 years</td><td>£2–£3</td></tr>
              <tr><td>9–10 years</td><td>£3–£5</td></tr>
              <tr><td>11–12 years</td><td>£5–£7.50</td></tr>
              <tr><td>13–14 years</td><td>£7–£10</td></tr>
              <tr><td>15+ years</td><td>£10–£15</td></tr>
            </tbody>
          </table>
          <p className="note">Lower end if you&apos;re also funding activities/outings directly; higher end if not.</p>
        </details>

        <details>
          <summary>Birthday, Christmas/festival &amp; summer payments</summary>
          <p className="note">
            Each is one week&apos;s age-related allowance per child. Birthday paid 2 weeks in advance; Christmas/
            festival paid 4 weeks in advance; summer paid just before the 6-week summer holiday (pro-rata if the
            child arrives partway through summer).
          </p>
        </details>

        <details>
          <summary>Setting-up &amp; initial clothing payments</summary>
          <p className="note">
            Up to £500 one-off &quot;setting up&quot; payment once you accept your first child on a full-time basis
            (cot, car seat, furniture, etc — needs receipts). Up to £100 for emergency clothing/supplies if a child
            arrives with nothing (agreed by your Supervising Social Worker, needs receipts).
          </p>
        </details>

        <details>
          <summary>Insurance contribution</summary>
          <p className="note">
            £150/year towards specialist house insurance (covering deliberate theft, malicious damage, fostered
            children&apos;s possessions) if you care for a child aged 11 or over.
          </p>
        </details>

        <details>
          <summary>Fostering Skills Payment</summary>
          <p className="note">Weekly, per child in placement:</p>
          <table style={{ width: "100%", marginTop: 6 }}>
            <tbody>
              <tr><td>Level 1</td><td>£0.00</td></tr>
              <tr><td>Level 2</td><td>£113.46</td></tr>
              <tr><td>Level 3</td><td>£226.92</td></tr>
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 6 }}>
            Specialist schemes (One-to-One, Mockingbird Hub Home Carer, Hope, Parent &amp; Child, Emergency Duty)
            pay £578.76/week instead, plus the child&apos;s age-related allowance.
          </p>
        </details>

        <details>
          <summary>Specific Allowance (£130.49/week)</summary>
          <p className="note">
            For a child&apos;s needs beyond standard care — e.g. being the only child placed with you, complex
            health/disability needs, being out of education (from day 4), enuresis, significantly dysregulated or
            challenging behaviour, an unaccompanied asylum-seeking child (first 6 weeks), or the third-plus child in
            a sibling group of 3+. Applied for by your Supervising Social Worker; reviewed roughly every 3 months.
          </p>
        </details>

        <details>
          <summary>Childcare cover for training</summary>
          <p className="note">
            £25 towards childcare when attending a Level 1 course in your first year fostering; £25, up to 3 times a
            year, from your second year onward.
          </p>
        </details>

        <details>
          <summary>Retainers</summary>
          <p className="note">
            If the service asks you to hold a place open for a specific child (e.g. ahead of a court date or planned
            move), you&apos;re paid at the Specific Allowance rate (£130.49/week) per child while it&apos;s held.
          </p>
        </details>

        <details>
          <summary>Staying Put &amp; Supported Lodgings</summary>
          <p className="note">
            <b>Staying Put:</b> the 14–18 allowance continues until the end of the academic year the young person
            turns 18 (if still in education); otherwise a Staying Put allowance of £293.84/week, with the young
            person contributing £70/week rent and £20/week food.
            <br />
            <b>Supported Lodgings:</b> £293.84/week support plus £70/week rent (£363.84/week total) — the rent is
            paid by the young person if 18+, otherwise by the service. A food contribution of around £20/week is
            negotiated with the young person.
          </p>
        </details>
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

      <ChangePasswordCard />
    </div>
  );
}
