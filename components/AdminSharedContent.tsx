"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BANDS, Rates } from "@/lib/types";

type RotaRow = { date: string; name: string; phone: string };
type Course = { id: string; group_key: string; group_label: string; title: string; how: string; platform: string; archived: boolean };
type Platform = { name: string; url: string };

const GROUP_LABELS: Record<string, string> = {
  pre: "Before approval (or one-off if added since)",
  once: "Mandatory — once",
  "3yr": "Mandatory — every 3 years",
  next: "Next steps (suggested)",
};

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
  const [courses, setCourses] = useState<Course[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [toast, setToast] = useState("");

  async function load() {
    const [{ data: r }, { data: rt }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("shared_rates").select("*").single(),
      supabase.from("shared_rota").select("date, name, phone").order("date"),
      supabase.from("shared_training_catalog").select("*").order("sort_order"),
      supabase.from("shared_training_platforms").select("*"),
    ]);
    setRates(r as Rates);
    setRota((rt as RotaRow[]) ?? []);
    setCourses((c as Course[]) ?? []);
    setPlatforms((p as Platform[]) ?? []);
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

  async function updateCourse(id: string, patch: Partial<Course>) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from("shared_training_catalog").update(patch).eq("id", id);
    showToast("Training catalogue updated — everyone sees this now");
  }

  async function addCourse(groupKey: string) {
    const title = prompt("Course title?");
    if (!title) return;
    const { error } = await supabase
      .from("shared_training_catalog")
      .insert({ group_key: groupKey, group_label: GROUP_LABELS[groupKey], title, sort_order: 999 });
    if (error) showToast("Couldn't add: " + error.message);
    else load();
  }

  async function updatePlatformUrl(name: string, url: string) {
    setPlatforms((prev) => prev.map((p) => (p.name === name ? { ...p, url } : p)));
    await supabase.from("shared_training_platforms").upsert({ name, url });
  }

  if (!rates) return <p className="muted">Loading…</p>;

  return (
    <div style={{ marginTop: 12 }}>
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
        <p className="muted">
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
      </div>

      <div className="card">
        <h3>Training platforms</h3>
        {platforms.map((p) => (
          <div key={p.name} className="row">
            <span style={{ flex: "0 0 220px" }}>{p.name}</span>
            <input value={p.url} onChange={(e) => updatePlatformUrl(p.name, e.target.value)} placeholder="link" />
          </div>
        ))}
      </div>

      {["pre", "once", "3yr", "next"].map((g) => (
        <div className="card" key={g}>
          <h3>{GROUP_LABELS[g]}</h3>
          {courses
            .filter((c) => c.group_key === g)
            .map((c) => (
              <div key={c.id} className="row" style={{ alignItems: "center" }}>
                <input
                  style={{ flex: 2 }}
                  defaultValue={c.title}
                  onBlur={(e) => updateCourse(c.id, { title: e.target.value })}
                />
                <input
                  style={{ flex: 1 }}
                  defaultValue={c.how}
                  placeholder="Online/In person/Either"
                  onBlur={(e) => updateCourse(c.id, { how: e.target.value })}
                />
                <select value={c.platform} onChange={(e) => updateCourse(c.id, { platform: e.target.value })}>
                  <option value="">platform…</option>
                  {platforms.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="chip" onClick={() => updateCourse(c.id, { archived: !c.archived })}>
                  {c.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
            ))}
          <button className="chip add" onClick={() => addCourse(g)}>
            + course
          </button>
        </div>
      ))}

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
