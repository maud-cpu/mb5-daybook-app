"use client";

import { useEffect, useState } from "react";
import { sortChildren, today } from "@/lib/domain";
import { Diary, DIARY_SECTIONS } from "@/lib/types";
import { useHouseholdNames } from "@/lib/useHouseholdNames";

function fmt(iso: string) {
  return iso ? new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function blankSections(): Record<string, string> {
  const o: Record<string, string> = {};
  DIARY_SECTIONS.forEach(([k]) => (o[k] = ""));
  return o;
}

export default function DiaryTab() {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today());
  const [swName, setSwName] = useState("");
  const [sections, setSections] = useState<Record<string, string>>(blankSections());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [lastTouchedBy, setLastTouchedBy] = useState<string | null>(null);
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});
  const [noteError, setNoteError] = useState<Record<string, string>>({});
  const [rewritingFor, setRewritingFor] = useState<string | null>(null);
  const { authorOf, myId } = useHouseholdNames();

  useEffect(() => {
    Promise.all([fetch("/api/children").then((r) => r.json()), fetch("/api/household-children").then((r) => r.json())]).then(
      ([kidsRes, hhKidsRes]) =>
        // A child in "Children in your household" can be an actual foster
        // placement too, not just the carer's own/adopted/kinship child --
        // they need to be selectable for a statutory diary the same as
        // any other child.
        setNames(
          sortChildren([
            ...(kidsRes.children ?? []),
            ...(hhKidsRes.children ?? []).map((c: { name: string }) => ({ ...c, lives_here: true })),
          ]).map((c: { name: string }) => c.name),
        ),
    );
  }, []);

  const sortedSelected = [...selected].sort();

  useEffect(() => {
    async function loadDiary() {
      const { diaries } = await fetch("/api/diaries").then((r) => r.json());
      const d = ((diaries as Diary[]) ?? []).find(
        (x) =>
          JSON.stringify([...x.child_names].sort()) === JSON.stringify(sortedSelected) &&
          (dateFrom ? x.date_from === dateFrom && x.date_to === dateTo : !x.date_from && x.date_to === dateTo),
      );
      if (d) {
        setSwName(d.sw_name);
        const s: Record<string, string> = {};
        DIARY_SECTIONS.forEach(([k]) => (s[k] = d[k] || ""));
        setSections(s);
        setLastTouchedBy(d.edited_by || d.user_id || null);
      } else {
        setSwName("");
        setSections(blankSections());
        setLastTouchedBy(null);
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
    await fetch("/api/diaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ child_names: sortedSelected, date_from: dateFrom || null, date_to: dateTo || null, sw_name: swName, ...next, edited_by: myId }),
    });
    setLastTouchedBy(myId);
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

  async function addNoteAndRewrite(k: string, label: string, hint: string) {
    const note = (noteFor[k] || "").trim();
    if (!note || !sortedSelected.length) return;
    setRewritingFor(k);
    setNoteError((prev) => ({ ...prev, [k]: "" }));
    // Save the carer's own words as a real record on the child's timeline
    // first -- the rewrite below only ever touches this diary box's text,
    // so without this the note would otherwise only ever exist rephrased.
    const recRes = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [{ bucket: "diary", date: today(), text: note, kids: sortedSelected, child: sortedSelected.length === 1 ? sortedSelected[0] : "" }],
      }),
    });
    if (!recRes.ok) {
      setNoteError((prev) => ({ ...prev, [k]: "Couldn't save that note" }));
      setRewritingFor(null);
      return;
    }
    const res = await fetch("/api/rewrite-box", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childLabel: sortedSelected.join(" & "), label, hint, existingText: sections[k], note, voice: "diary" }),
    });
    const data = await res.json();
    setRewritingFor(null);
    if (data.error) {
      setNoteError((prev) => ({ ...prev, [k]: `${data.error} — but your note is saved on the record.` }));
      return;
    }
    save({ [k]: data.text });
    setNoteFor((prev) => ({ ...prev, [k]: "" }));
    setNoteOpenFor(null);
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
        {authorOf(lastTouchedBy) && <span className="badge-author">last edited by {authorOf(lastTouchedBy)}</span>}
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
          {noteOpenFor === k ? (
            <div style={{ marginTop: 8, padding: 8, background: "#fbfaf6", borderRadius: "var(--radius-sm)" }}>
              <textarea
                rows={2}
                placeholder="Add something extra and I'll weave it into the box above"
                value={noteFor[k] || ""}
                onChange={(e) => setNoteFor((prev) => ({ ...prev, [k]: e.target.value }))}
              />
              {noteError[k] && <p style={{ color: "var(--danger)", fontSize: 14 }}>{noteError[k]}</p>}
              <div className="row">
                <button className="btn" onClick={() => addNoteAndRewrite(k, h, hint)} disabled={rewritingFor === k || !noteFor[k]?.trim()}>
                  {rewritingFor === k ? "Rewriting…" : "Add & rewrite"}
                </button>
                <button className="chip" onClick={() => setNoteOpenFor(null)}>
                  Cancel
                </button>
              </div>
              <p className="note">This also gets saved to {sortedSelected.join(" & ") || "the child's"} record.</p>
            </div>
          ) : (
            sortedSelected.length > 0 && (
              <button className="chip" onClick={() => setNoteOpenFor(k)}>
                + Add a note &amp; rewrite
              </button>
            )
          )}
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
