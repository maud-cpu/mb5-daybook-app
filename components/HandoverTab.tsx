"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { HOUSEHOLD_FIELDS, PROFILE_FIELDS } from "@/lib/handover";

type ChildRow = {
  id: string;
  name: string;
  basics: Record<string, string>;
  hub_carer_name: string;
  hub_carer_phone: string;
};
type Profile = Record<string, string>;
type AboutHousehold = { ssw_name: string; ssw_phone: string; ssw_email: string };

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

/**
 * Most of what a handover plan needs has already been typed into About Us
 * (per-child basics, hub carer, the household's own SSW details) -- rather
 * than ask for it again, an empty handover field is suggested from there
 * instead. It's only ever a starting point: the moment a carer saves
 * anything into the actual handover field it takes over completely, so
 * this never overwrites something already filled in on purpose.
 */
function suggestProfile(child: ChildRow): Partial<Profile> {
  const b = child.basics || {};
  const health = [b.gp && `GP: ${b.gp}`, b.allergies && `Allergies/medication: ${b.allergies}`, b.nhs && `NHS number: ${b.nhs}`]
    .filter(Boolean)
    .join("\n");
  const school = [b.school && `School: ${b.school}`, b.teacher && `Key contact: ${b.teacher}`].filter(Boolean).join("\n");
  const nogo = [b.nocontact && `Must NOT have contact: ${b.nocontact}`, b.photos && `Photo/social media: ${b.photos}`]
    .filter(Boolean)
    .join("\n");
  return { health, school, contact: b.contact || "", nogo };
}

function suggestHousehold(selectedChildren: ChildRow[], aboutHousehold: AboutHousehold): Partial<Profile> {
  const perChild = (pick: (c: ChildRow) => string) =>
    selectedChildren
      .map((c) => {
        const v = pick(c);
        return v ? (selectedChildren.length > 1 ? `${c.name}: ${v}` : v) : "";
      })
      .filter(Boolean)
      .join("\n");
  return {
    ssw_name: [aboutHousehold.ssw_name, aboutHousehold.ssw_phone, aboutHousehold.ssw_email].filter(Boolean).join(" — "),
    csw: perChild((c) => c.basics?.csw || ""),
    gp: perChild((c) => c.basics?.gp || ""),
    hub: perChild((c) => [c.hub_carer_name, c.hub_carer_phone].filter(Boolean).join(" ")),
    delegated: perChild((c) => c.basics?.delegated || ""),
  };
}

export default function HandoverTab() {
  const supabase = createClient();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [household, setHousehold] = useState<Profile>(blankHousehold());
  const [aboutHousehold, setAboutHousehold] = useState<AboutHousehold>({ ssw_name: "", ssw_phone: "", ssw_email: "" });
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [receivingCarer, setReceivingCarer] = useState("");
  const [thisStay, setThisStay] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [draftingFor, setDraftingFor] = useState<string | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  async function load() {
    const [{ data: kids }, { data: profileRows }, { data: hh }] = await Promise.all([
      supabase.from("children").select("id, name, basics, hub_carer_name, hub_carer_phone").order("created_at"),
      supabase.from("handover_child_profiles").select("*"),
      supabase
        .from("household")
        .select("ssw_name, ssw_phone, ssw_email, csw, edt, gp, hub, school_contact, delegated, carseat")
        .maybeSingle(),
    ]);
    setChildren(
      ((kids as (ChildRow & { basics: Record<string, string> | null })[]) ?? []).map((c) => ({
        ...c,
        basics: c.basics || {},
      })),
    );
    if (hh) setAboutHousehold({ ssw_name: hh.ssw_name || "", ssw_phone: hh.ssw_phone || "", ssw_email: hh.ssw_email || "" });
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

  async function draftFromNotes(childId: string, childName: string) {
    setDraftingFor(childId);
    setDraftErrors((prev) => ({ ...prev, [childId]: "" }));
    try {
      const res = await fetch("/api/draft-handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childName }),
      });
      const data = await res.json();
      if (data.error) {
        setDraftErrors((prev) => ({ ...prev, [childId]: data.error }));
        return;
      }
      const saved = profiles[childId] || blankProfile();
      for (const [k] of PROFILE_FIELDS) {
        const value = data.sections?.[k];
        if (!saved[k]?.trim() && value?.trim()) {
          await saveProfileField(childId, k, value);
        }
      }
    } catch {
      setDraftErrors((prev) => ({ ...prev, [childId]: "Couldn't reach the drafting service — try again in a moment." }));
    }
    setDraftingFor(null);
  }

  async function saveHouseholdField(key: string, value: string) {
    setHousehold((prev) => ({ ...prev, [key]: value }));
    await supabase.from("household").upsert({ [key]: value, updated_at: new Date().toISOString() });
    flashSaved();
  }

  function profileOf(childId: string): Profile {
    const saved = profiles[childId] || blankProfile();
    const child = children.find((c) => c.id === childId);
    const suggested = child ? suggestProfile(child) : {};
    const merged: Profile = { ...saved };
    (Object.keys(suggested) as string[]).forEach((k) => {
      if (!merged[k]?.trim() && suggested[k]) merged[k] = suggested[k]!;
    });
    return merged;
  }

  function householdOf(): Profile {
    // Falls back to every child in the household when none is selected yet
    // for a plan -- these fields (CSW, GP, hub carer, delegated authority)
    // are useful reference info on their own, not just once a specific
    // child has been picked to go somewhere.
    const selectedChildren = sortedSelected.length
      ? (sortedSelected.map((n) => children.find((c) => c.name === n)).filter(Boolean) as ChildRow[])
      : children;
    const suggested = suggestHousehold(selectedChildren, aboutHousehold);
    const merged: Profile = { ...household };
    (Object.keys(suggested) as string[]).forEach((k) => {
      if (!merged[k]?.trim() && suggested[k]) merged[k] = suggested[k]!;
    });
    return merged;
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
  const hhMerged = householdOf();
  HOUSEHOLD_FIELDS.forEach(([k, label]) => {
    if (!hhMerged[k]?.trim()) gaps.push(label);
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
<h3>3. Contacts, health & consents</h3><table>${HOUSEHOLD_FIELDS.map(([k, label, hint]) => row(label, householdOf()[k], hint)).join("")}</table>
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
        <p className="note">
          Child and household details below are saved once and reused for every plan — update them as things
          change. Anything not yet filled in here is suggested from About Us, so you&apos;re not retyping what&apos;s
          already there.
        </p>
        {savedAt && <p className="hint">Saved {savedAt}</p>}
      </div>

      {sortedSelected.map((n) => {
        const child = children.find((c) => c.name === n);
        if (!child) return null;
        const p = profileOf(child.id);
        return (
          <div className="card" key={child.id}>
            <h3>{n}</h3>
            <button className="chip" onClick={() => draftFromNotes(child.id, n)} disabled={draftingFor === child.id}>
              {draftingFor === child.id ? "Drafting…" : "Draft from your notes"}
            </button>
            <p className="note">Fills empty boxes only, from what&apos;s actually in your diary entries about {n}.</p>
            {draftErrors[child.id] && <p style={{ color: "var(--danger)", fontSize: 14 }}>{draftErrors[child.id]}</p>}
            {PROFILE_FIELDS.map(([k, label, hint]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <b>{label}</b>
                <p className="muted" style={{ margin: "0 0 4px" }}>
                  {hint}
                </p>
                <textarea
                  key={`${k}-${profiles[child.id]?.[k] ?? ""}`}
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
        <p className="note">
          Fields below are suggested from About Us where you haven&apos;t filled them in here — check they still
          match before saving.
        </p>
        {HOUSEHOLD_FIELDS.map(([k, label, hint]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <b>{label}</b>
            <p className="muted" style={{ margin: "0 0 4px" }}>
              {hint}
            </p>
            <textarea
              key={`${k}-${sortedSelected.join(",")}`}
              placeholder={`Nothing yet — ${hint}`}
              defaultValue={householdOf()[k]}
              onBlur={(e) => saveHouseholdField(k, e.target.value)}
            />
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
