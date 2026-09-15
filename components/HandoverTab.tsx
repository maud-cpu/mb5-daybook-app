"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { HOUSEHOLD_FIELDS, PROFILE_FIELDS } from "@/lib/handover";

type ChildRow = { id: string; name: string };
type Profile = Record<string, string>;

function fmt(iso: string) {
  return iso ? new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function blankProfile(): Profile {
  const o: Profile = {};
  PROFILE_FIELDS.forEach(([k]) => (o[k] = ""));
  return o;
}

function blankHousehold(): Profile {
  const o: Profile = {};
  HOUSEHOLD_FIELDS.forEach(([k]) => (o[k] = ""));
  return o;
}

export default function HandoverTab() {
  const supabase = createClient();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [household, setHousehold] = useState<Profile>(blankHousehold());
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [receivingCarer, setReceivingCarer] = useState("");
  const [thisStay, setThisStay] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [savedAt, setSavedAt] = useState("");

  async function load() {
    const [{ data: kids }, { data: profileRows }, { data: hh }] = await Promise.all([
      supabase.from("children").select("id, name").order("created_at"),
      supabase.from("handover_child_profiles").select("*"),
      supabase.from("household").select("ssw_name, csw, edt, gp, hub, school_contact, delegated, carseat").maybeSingle(),
    ]);
    setChildren((kids as ChildRow[]) ?? []);
    const byChild: Record<string, Profile> = {};
    (profileRows ?? []).forEach((p: Profile & { child_id: string }) => (byChild[p.child_id] = p));
    setProfiles(byChild);
    if (hh) setHousehold({ ...blankHousehold(), ...hh });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedSelected = [...selected].sort();

  useEffect(() => {
    async function loadPlan() {
      const { data } = await supabase
        .from("handover_plans")
        .select("*")
        .eq("child_names", sortedSelected)
        .eq("date_from", dateFrom)
        .eq("date_to", dateTo)
        .maybeSingle();
      setReceivingCarer(data?.receiving_carer ?? "");
      setThisStay(data?.this_stay ?? "");
      setReturnNotes(data?.return_notes ?? "");
    }
    if (sortedSelected.length) {
       
      loadPlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSelected.join(","), dateFrom, dateTo]);

  function toggleChild(n: string) {
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function flashSaved() {
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  async function savePlan(patch: Partial<{ receiving_carer: string; this_stay: string; return_notes: string }>) {
    await supabase.from("handover_plans").upsert(
      {
        child_names: sortedSelected,
        date_from: dateFrom,
        date_to: dateTo,
        receiving_carer: receivingCarer,
        this_stay: thisStay,
        return_notes: returnNotes,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,child_names,date_from,date_to" },
    );
    flashSaved();
  }

  async function saveProfileField(childId: string, key: string, value: string) {
    const next = { ...(profiles[childId] || blankProfile()), [key]: value };
    setProfiles((prev) => ({ ...prev, [childId]: next }));
    await supabase.from("handover_child_profiles").upsert(
      { child_id: childId, ...next },
      { onConflict: "user_id,child_id" },
    );
    flashSaved();
  }

  async function saveHouseholdField(key: string, value: string) {
    setHousehold((prev) => ({ ...prev, [key]: value }));
    await supabase.from("household").upsert({ [key]: value, updated_at: new Date().toISOString() });
    flashSaved();
  }

  function profileOf(childId: string): Profile {
    return profiles[childId] || blankProfile();
  }

  const gaps: string[] = [];
  sortedSelected.forEach((n) => {
    const child = children.find((c) => c.name === n);
    if (!child) return;
    const p = profileOf(child.id);
    PROFILE_FIELDS.forEach(([k, label]) => {
      if (!p[k]?.trim()) gaps.push(`${n}: ${label}`);
    });
  });
  HOUSEHOLD_FIELDS.forEach(([k, label]) => {
    if (!household[k]?.trim()) gaps.push(label);
  });

  function exportWord() {
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const row = (label: string, value: string, hint?: string) =>
      `<tr><td class="h" style="width:32%">${label}<br><span class="hint">${hint || ""}</span></td><td>${esc(value?.trim() || "—")}</td></tr>`;
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%;margin-bottom:12px}td{border:1px solid #000;padding:6px;vertical-align:top}.h{background:#d9e2f3;font-weight:bold}.hint{font-weight:normal;font-style:italic;font-size:9pt}h2,h3{margin:14px 0 6px}</style></head><body>
<h2>Holiday / sleepover plan</h2><table>${row("Children", sortedSelected.join(" & "))}${row("Dates", `${fmt(dateFrom)} to ${fmt(dateTo)}`)}${row("Prepared", fmt(today()))}</table>
<h3>1. Care arrangements</h3><table>${row("Receiving carer(s)", receivingCarer)}${row("This stay", thisStay)}${row("Return & updates", returnNotes)}</table>
${sortedSelected
  .map((n) => {
    const child = children.find((c) => c.name === n);
    const p = child ? profileOf(child.id) : blankProfile();
    return `<h3>2. ${n} — needs & routines</h3><table>${PROFILE_FIELDS.map(([k, label, hint]) => row(label, p[k], hint)).join("")}</table>`;
  })
  .join("")}
<h3>3. Contacts, health & consents</h3><table>${HOUSEHOLD_FIELDS.map(([k, label, hint]) => row(label, household[k], hint)).join("")}</table>
<p><i>Do not include card PINs, passwords or full dates of birth — hand these over in person.</i></p></body></html>`;
    const name = `Sleepover-plan-${sortedSelected.join("-") || "plan"}-${fmt(dateFrom)}`.replace(/[^a-z0-9-]+/gi, "-") + ".doc";
    const blob = new Blob(["﻿" + html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div>
      <div className="card">
        <h3>Handover / sleepover plan</h3>
        <div className="chips">
          {children.map((c) => (
            <button key={c.id} className={`chip${selected.includes(c.name) ? " on" : ""}`} onClick={() => toggleChild(c.name)}>
              {c.name}
            </button>
          ))}
          <span className="muted" style={{ alignSelf: "center" }}>
            who&apos;s going
          </span>
        </div>
        <div className="row">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="muted" style={{ alignSelf: "center" }}>
            to
          </span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <input
          placeholder="Receiving carer(s), relationship, phone, address"
          value={receivingCarer}
          onChange={(e) => setReceivingCarer(e.target.value)}
          onBlur={() => savePlan({ receiving_carer: receivingCarer })}
        />
        <textarea
          placeholder="Anything special about THIS stay — end-of-term events, clubs, what they're looking forward to or worried about"
          value={thisStay}
          onChange={(e) => setThisStay(e.target.value)}
          onBlur={() => savePlan({ this_stay: thisStay })}
        />
        <textarea
          placeholder="Return arrangements — when, where, who collects; how you'd like updates (text at bedtime?)"
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          onBlur={() => savePlan({ return_notes: returnNotes })}
        />
        <p className="note">Child and household details below are saved once and reused for every plan — update them as things change.</p>
        {savedAt && <p className="hint">Saved {savedAt}</p>}
      </div>

      {sortedSelected.map((n) => {
        const child = children.find((c) => c.name === n);
        if (!child) return null;
        const p = profileOf(child.id);
        return (
          <div className="card" key={child.id}>
            <h3>{n}</h3>
            {PROFILE_FIELDS.map(([k, label, hint]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <b>{label}</b>
                <p className="muted" style={{ margin: "0 0 4px" }}>
                  {hint}
                </p>
                <textarea
                  placeholder={`Nothing yet — ${hint}`}
                  defaultValue={p[k]}
                  onBlur={(e) => saveProfileField(child.id, k, e.target.value)}
                />
              </div>
            ))}
          </div>
        );
      })}

      <div className="card">
        <h3>Household & contacts</h3>
        {HOUSEHOLD_FIELDS.map(([k, label, hint]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <b>{label}</b>
            <p className="muted" style={{ margin: "0 0 4px" }}>
              {hint}
            </p>
            <textarea placeholder={`Nothing yet — ${hint}`} defaultValue={household[k]} onBlur={(e) => saveHouseholdField(k, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="card">
        {gaps.length ? (
          <p className="note" style={{ color: "#a66d00" }}>
            ⚠ {gaps.length} gap{gaps.length > 1 ? "s" : ""}: {gaps.slice(0, 8).join("; ")}
            {gaps.length > 8 ? "…" : ""}
          </p>
        ) : (
          <p className="note">Nothing missing.</p>
        )}
        <p className="note">Never put card PINs, passwords or full dates of birth in a plan that leaves the house — give those in person.</p>
        <button className="btn" disabled={!sortedSelected.length} onClick={exportWord}>
          Save as Word document
        </button>
      </div>
    </div>
  );
}
