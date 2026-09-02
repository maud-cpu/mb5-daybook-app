"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { Diary, DIARY_SECTIONS } from "@/lib/types";

function fmt(iso: string) {
  return iso ? new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function blankSections(): Record<string, string> {
  const o: Record<string, string> = {};
  DIARY_SECTIONS.forEach(([k]) => (o[k] = ""));
  return o;
}

export default function DiaryTab() {
  const supabase = createClient();
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today());
  const [swName, setSwName] = useState("");
  const [sections, setSections] = useState<Record<string, string>>(blankSections());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    supabase
      .from("children")
      .select("name")
      .then(({ data }) => setNames((data ?? []).map((c: { name: string }) => c.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedSelected = [...selected].sort();

  useEffect(() => {
    async function loadDiary() {
      const query = supabase.from("diaries").select("*").eq("child_names", sortedSelected);
      const { data } = dateFrom ? await query.eq("date_from", dateFrom).eq("date_to", dateTo) : await query.is("date_from", null).eq("date_to", dateTo);
      const d = (data ?? [])[0] as Diary | undefined;
      if (d) {
        setSwName(d.sw_name);
        const s: Record<string, string> = {};
        DIARY_SECTIONS.forEach(([k]) => (s[k] = d[k] || ""));
        setSections(s);
      } else {
        setSwName("");
        setSections(blankSections());
      }
    }
     
    loadDiary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSelected.join(","), dateFrom, dateTo]);

  function toggleChild(n: string) {
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  async function save(patch: Record<string, string>) {
    const next = { ...sections, ...patch };
    setSections(next);
    await supabase.from("diaries").upsert(
      { child_names: sortedSelected, date_from: dateFrom || null, date_to: dateTo || null, sw_name: swName, ...next },
      { onConflict: "user_id,child_names,date_from,date_to" },
    );
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  async function draft() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/draft-diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childNames: sortedSelected, dateFrom, dateTo }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    const patch: Record<string, string> = {};
    DIARY_SECTIONS.forEach(([k]) => {
      if (!sections[k]?.trim() && data.sections?.[k]) patch[k] = data.sections[k];
    });
    save(patch);
  }

  function exportWord() {
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const label = sortedSelected.join(" & ") || "child";
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:6px;vertical-align:top}.h{background:#d9e2f3;font-weight:bold}.hint{font-weight:normal;font-style:italic;font-size:9pt}</style></head><body>
<p><b>Foster Carer Electronic Diary</b></p>
<table><tr class="h"><td>Dates</td><td>Child's Name</td><td>Social Worker's Name</td></tr>
<tr><td>${esc(fmt(dateFrom))} to ${esc(fmt(dateTo))}</td><td>${esc(label)}</td><td>${esc(swName)}</td></tr>
${DIARY_SECTIONS.map(([k, h, hint]) => `<tr class="h"><td colspan="3">${h}<br><span class="hint">(${hint})</span></td></tr><tr><td colspan="3">${esc(sections[k]?.trim() || "N/a")}</td></tr>`).join("")}
</table></body></html>`;
    const name = `Foster-Carer-Diary-${label.replace(/[^a-z0-9]+/gi, "-")}-${dateTo}.doc`.toLowerCase();
    const blob = new Blob(["﻿" + html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const missing = DIARY_SECTIONS.filter(([k]) => !sections[k]?.trim());

  return (
    <div>
      <div className="card">
        <h3>Diary for social worker</h3>
        <div className="chips">
          {names.map((n) => (
            <button key={n} className={`chip${selected.includes(n) ? " on" : ""}`} onClick={() => toggleChild(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="hint">Tap all children this diary covers.</p>
        <div className="row">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="muted" style={{ alignSelf: "center" }}>
            to
          </span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <input placeholder="Social worker's name" value={swName} onChange={(e) => setSwName(e.target.value)} onBlur={() => save({})} />
        {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
        <button className="btn" onClick={draft} disabled={busy}>
          {busy ? "Drafting…" : "Draft from my entries"}
        </button>
        <p className="note">Drafting fills empty boxes only — it never overwrites what you&apos;ve written.</p>
        {savedAt && <p className="hint">Saved {savedAt}</p>}
      </div>

      {DIARY_SECTIONS.map(([k, h, hint]) => (
        <div className="card" key={k} style={{ borderLeft: sections[k]?.trim() ? undefined : "4px solid var(--marker)" }}>
          <h3>{h}</h3>
          <p className="muted">{hint}</p>
          <textarea
            rows={4}
            value={sections[k] || ""}
            onChange={(e) => setSections((prev) => ({ ...prev, [k]: e.target.value }))}
            onBlur={() => save({})}
          />
        </div>
      ))}

      <div className="card">
        {missing.length ? (
          <p className="note" style={{ color: "#a66d00" }}>
            ⚠ {missing.length} box{missing.length > 1 ? "es" : ""} still empty: {missing.map((x) => x[1]).join(", ")}.
          </p>
        ) : (
          <p className="note">All boxes filled.</p>
        )}
        <button className="btn" onClick={exportWord}>
          Save as Word document
        </button>
      </div>
    </div>
  );
}
