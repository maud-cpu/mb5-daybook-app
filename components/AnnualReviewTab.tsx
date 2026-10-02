"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ANNUAL_REVIEW_SECTIONS, AnnualReviewSectionKey } from "@/lib/types";
import HouseholdDocuments, { HouseholdDoc } from "@/components/HouseholdDocuments";

type ChecklistItem = { text: string; done: boolean };

type Household = {
  ssw_name: string;
  ssw_email: string;
  annual_review_date: string | null;
  annual_review_checklist: ChecklistItem[];
  annual_review_notes: Partial<Record<AnnualReviewSectionKey, string>>;
  annual_review_sent_at: string | null;
};

function fmtDate(iso: string): string {
  return iso ? new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function blankNotes(): Partial<Record<AnnualReviewSectionKey, string>> {
  const o: Partial<Record<AnnualReviewSectionKey, string>> = {};
  ANNUAL_REVIEW_SECTIONS.forEach(([k]) => (o[k] = ""));
  return o;
}

export default function AnnualReviewTab() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [notes, setNotes] = useState<Partial<Record<AnnualReviewSectionKey, string>>>(blankNotes());
  const [sentAt, setSentAt] = useState("");
  const [docs, setDocs] = useState<HouseholdDoc[]>([]);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    fetch("/api/household")
      .then((r) => r.json())
      .then(({ household: h }) => {
        if (!h) return;
        setHousehold(h as Household);
        setNotes({ ...blankNotes(), ...(h.annual_review_notes || {}) });
        setSentAt(h.annual_review_sent_at || "");
      });
  }, []);

  async function save(patch: Record<string, unknown>) {
    await fetch("/api/household", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  function saveNote(key: AnnualReviewSectionKey, value: string) {
    const next = { ...notes, [key]: value };
    setNotes(next);
    save({ annual_review_notes: next });
  }

  function exportWord() {
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const outstanding = (household?.annual_review_checklist || []).filter((c) => !c.done);
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:6px;vertical-align:top}.h{background:#d9e2f3;font-weight:bold}.hint{font-weight:normal;font-style:italic;font-size:9pt}</style></head><body>
<p><b>Foster Carer Annual Review</b></p>
<table><tr class="h"><td>Review date</td><td>Supervising social worker</td></tr>
<tr><td>${esc(fmtDate(household?.annual_review_date || ""))}</td><td>${esc(household?.ssw_name || "")}</td></tr>
${ANNUAL_REVIEW_SECTIONS.map(([k, h, hint]) => `<tr class="h"><td colspan="2">${h}<br><span class="hint">(${hint})</span></td></tr><tr><td colspan="2">${esc(notes[k]?.trim() || "N/a")}</td></tr>`).join("")}
<tr class="h"><td colspan="2">Requirements checklist still outstanding</td></tr>
<tr><td colspan="2">${outstanding.length ? outstanding.map((c) => esc(c.text)).join("<br>") : "None — all done"}</td></tr>
</table></body></html>`;
    const name = `Annual-Review-${(household?.annual_review_date || "draft").toLowerCase()}.doc`;
    const blob = new Blob(["﻿" + html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function sendToSw() {
    const lines: string[] = [];
    ANNUAL_REVIEW_SECTIONS.forEach(([k, label]) => {
      const text = notes[k]?.trim();
      if (text) lines.push(`${label}:\n${text}\n`);
    });
    const outstanding = (household?.annual_review_checklist || []).filter((c) => !c.done);
    if (outstanding.length) lines.push(`Requirements still outstanding:\n${outstanding.map((c) => "- " + c.text).join("\n")}\n`);
    if (docs.length) {
      lines.push(
        `Documents to attach (download from the app first — they can't attach automatically):\n${docs
          .map((d) => "- " + (d.title || d.file_name))
          .join("\n")}`,
      );
    }
    const body = lines.join("\n");
    const subject = `Annual review${household?.annual_review_date ? " — " + fmtDate(household.annual_review_date) : ""}`;
    const mailto = `mailto:${encodeURIComponent(household?.ssw_email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    saveSentAt(new Date().toISOString().slice(0, 10));
  }

  function saveSentAt(value: string) {
    setSentAt(value);
    save({ annual_review_sent_at: value || null });
  }

  if (!household) return <p className="muted">Loading…</p>;

  const outstandingCount = (household.annual_review_checklist || []).filter((c) => !c.done).length;

  return (
    <div>
      <div className="card">
        <h3>Your annual review</h3>
        <p className="hint">
          Review date: <b>{household.annual_review_date ? fmtDate(household.annual_review_date) : "not set"}</b> · Checklist:{" "}
          <b>{outstandingCount ? `${outstandingCount} outstanding` : "all done"}</b>.{" "}
          <Link href="/dashboard/about">Edit the date or checklist in About Us →</Link>
        </p>
      </div>

      {ANNUAL_REVIEW_SECTIONS.map(([k, h, hint]) => (
        <div className="card" key={k}>
          <h3>{h}</h3>
          {hint && <p className="muted">{hint}</p>}
          <textarea rows={4} value={notes[k] || ""} onChange={(e) => setNotes((prev) => ({ ...prev, [k]: e.target.value }))} onBlur={() => saveNote(k, notes[k] || "")} />
        </div>
      ))}

      <div className="card">
        <h3>Documents</h3>
        <HouseholdDocuments onChange={setDocs} />
      </div>

      <div className="card">
        <h3>Send to your SSW</h3>
        <label className="hint" style={{ display: "block" }}>
          Sent on
        </label>
        <input type="date" value={sentAt} onChange={(e) => saveSentAt(e.target.value)} />
        <p className="hint" style={{ marginTop: 8 }}>
          Opens your mail app with the boxes above filled in. Email links can&apos;t attach files automatically — download
          each document above first (Open ↗) and attach them before you send.
        </p>
        {!household.ssw_email && <p className="note">No email on file for your SSW yet — add one in About Us first.</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={sendToSw} disabled={!household.ssw_email}>
            Open email to SSW
          </button>
          <button className="chip" onClick={exportWord}>
            Save as Word document
          </button>
        </div>
        {savedAt && <p className="hint">Saved {savedAt}</p>}
      </div>
    </div>
  );
}
