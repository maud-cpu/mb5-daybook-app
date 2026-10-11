"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BANDS, Rates } from "@/lib/types";
import NewsAdmin from "@/components/NewsAdmin";
import HubCalendarAdmin from "@/components/HubCalendarAdmin";
import HubDirectoryAdmin from "@/components/HubDirectoryAdmin";
import ResourceRecommendationsAdmin from "@/components/ResourceRecommendationsAdmin";

type RotaRow = { date: string; name: string; phone: string };

function parseRotaPaste(text: string): RotaRow[] {
  const monthMatch = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (!monthMatch) return [];
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const mon = months.indexOf(monthMatch[1].toLowerCase()) + 1;
  const yr = monthMatch[2];
  const re =
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(?:st|nd|rd|th)?[\s/|]*([A-Za-z][A-Za-z .'-]+?)[\s/|]*(0\d[\d ]{8,12})/g;
  const out: RotaRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({
      date: `${yr}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      name: m[2].trim(),
      phone: m[3].trim(),
    });
  }
  return out;
}

export default function AdminSharedContent() {
  const supabase = createClient();
  const [rates, setRates] = useState<Rates | null>(null);
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [rotaPaste, setRotaPaste] = useState("");
  const [importingRotaFile, setImportingRotaFile] = useState(false);
  const [rotaHours, setRotaHours] = useState({ weekday_hours: "", weekend_hours: "" });
  const [toast, setToast] = useState("");

  async function load() {
    const [{ data: r }, { data: rt }, { data: rh }] = await Promise.all([
      supabase.from("shared_rates").select("*").single(),
      supabase.from("shared_rota").select("date, name, phone").order("date"),
      supabase.from("shared_rota_hours").select("weekday_hours, weekend_hours").maybeSingle(),
    ]);
    setRates(r as Rates);
    setRota((rt as RotaRow[]) ?? []);
    if (rh) setRotaHours({ weekday_hours: rh.weekday_hours || "", weekend_hours: rh.weekend_hours || "" });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  async function saveRate(patch: Partial<Rates>) {
    if (!rates) return;
    const next = { ...rates, ...patch };
    setRates(next);
    const { error } = await supabase.from("shared_rates").update(patch).eq("id", true);
    showToast(error ? "Couldn't save: " + error.message : "Rates updated — everyone sees this now");
  }

  function setBandRate(field: "day_first" | "day_add" | "overnight", band: string, value: number) {
    if (!rates) return;
    saveRate({ [field]: { ...rates[field], [band]: value } } as Partial<Rates>);
  }

  async function saveRotaHours(patch: Partial<typeof rotaHours>) {
    const next = { ...rotaHours, ...patch };
    setRotaHours(next);
    const { error } = await supabase.from("shared_rota_hours").upsert({ ...next }, { onConflict: "household_owner_id" });
    if (error) showToast("Couldn't save: " + error.message);
  }

  async function importRota() {
    const rows = parseRotaPaste(rotaPaste);
    if (!rows.length) {
      showToast("Couldn't find the month/year and dates in that text");
      return;
    }
    const { error } = await supabase.from("shared_rota").upsert(rows);
    if (error) showToast("Couldn't save rota: " + error.message);
    else {
      showToast(`Loaded ${rows.length} days`);
      setRotaPaste("");
      load();
    }
  }

  // For when the rota document can't be copy-pasted at all (a read-only
  // viewer, a locked file, a phone that won't let you select table text) --
  // upload the .docx itself and let the server pull the same plain text out
  // of it that the paste box already knows how to parse.
  async function importRotaFile(file: File) {
    setImportingRotaFile(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import-rota", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Couldn't read that file");
        return;
      }
      const rows = parseRotaPaste(data.text);
      if (!rows.length) {
        showToast("Couldn't find the month/year and dates in that document");
        return;
      }
      const { error } = await supabase.from("shared_rota").upsert(rows);
      if (error) showToast("Couldn't save rota: " + error.message);
      else {
        showToast(`Loaded ${rows.length} days`);
        load();
      }
    } finally {
      setImportingRotaFile(false);
    }
  }

  if (!rates) return <p className="muted">Loading…</p>;

  return (
    <div style={{ marginTop: 12 }}>
      <NewsAdmin showToast={showToast} />
      <HubCalendarAdmin showToast={showToast} />
      <HubDirectoryAdmin showToast={showToast} />
      <ResourceRecommendationsAdmin showToast={showToast} />
      <div className="card">
        <h3>Rates — {rates.label}</h3>
        <label>Label</label>
        <input value={rates.label} onChange={(e) => saveRate({ label: e.target.value })} />
        <div className="row">
          <label style={{ flex: 1 }}>
            Mileage £/mile
            <input type="number" step="0.01" value={rates.mileage} onChange={(e) => saveRate({ mileage: Number(e.target.value) })} />
          </label>
          <label style={{ flex: 1 }}>
            Miles deducted/day
            <input type="number" value={rates.daily_deduct} onChange={(e) => saveRate({ daily_deduct: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>
            Day care &lt;5hrs, first child £/hr
            <input type="number" step="0.01" value={rates.hour_first} onChange={(e) => saveRate({ hour_first: Number(e.target.value) })} />
          </label>
          <label style={{ flex: 1 }}>
            Additional child £/hr
            <input type="number" step="0.01" value={rates.hour_add} onChange={(e) => saveRate({ hour_add: Number(e.target.value) })} />
          </label>
        </div>
        <table style={{ width: "100%", marginTop: 8 }}>
          <thead>
            <tr>
              <th align="left">Band</th>
              <th align="left">Day (5+ hrs) first</th>
              <th align="left">Day (5+ hrs) additional</th>
              <th align="left">Overnight (first)</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                <td>
                  <input type="number" step="0.01" value={rates.day_first[b]} onChange={(e) => setBandRate("day_first", b, Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" step="0.01" value={rates.day_add[b]} onChange={(e) => setBandRate("day_add", b, Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" step="0.01" value={rates.overnight[b]} onChange={(e) => setBandRate("overnight", b, Number(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Changes save immediately and every carer sees them straight away.</p>
      </div>

      <div className="card">
        <h3>Out-of-hours rota</h3>
        <p className="hint">
          When the service actually runs — shown on the phone quick-access as just today&apos;s actual window, e.g.
          &quot;Out of hours tonight (6pm-11pm)&quot; on a weekday. Bank holidays aren&apos;t detected automatically —
          treat a bank holiday weekday as a weekend day for this.
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          <span className="muted" style={{ flex: "0 0 130px" }}>
            Weekdays (Mon-Fri)
          </span>
          <input
            placeholder="e.g. 6pm-11pm"
            value={rotaHours.weekday_hours}
            onChange={(e) => setRotaHours({ ...rotaHours, weekday_hours: e.target.value })}
            onBlur={(e) => saveRotaHours({ weekday_hours: e.target.value })}
          />
        </div>
        <div className="row" style={{ alignItems: "center", marginTop: 6 }}>
          <span className="muted" style={{ flex: "0 0 130px" }}>
            Weekends (Sat-Sun)
          </span>
          <input
            placeholder="e.g. 10am-11pm"
            value={rotaHours.weekend_hours}
            onChange={(e) => setRotaHours({ ...rotaHours, weekend_hours: e.target.value })}
            onBlur={(e) => saveRotaHours({ weekend_hours: e.target.value })}
          />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          {rota.length} days loaded {rota.length ? `(${rota[0].date} to ${rota[rota.length - 1].date})` : ""}
        </p>
        <textarea
          rows={3}
          placeholder="Paste the whole rota document text here"
          value={rotaPaste}
          onChange={(e) => setRotaPaste(e.target.value)}
        />
        <button className="btn" onClick={importRota}>
          Load rota
        </button>
        <p className="hint" style={{ marginTop: 10 }}>
          Can&apos;t copy the text out of it? Upload the .docx file directly instead.
        </p>
        <input
          type="file"
          accept=".docx"
          disabled={importingRotaFile}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importRotaFile(file);
            e.target.value = "";
          }}
        />
        {importingRotaFile && <p className="hint">Reading document…</p>}
      </div>

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
