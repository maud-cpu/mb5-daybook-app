"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { HOUSEHOLD_FIELDS, PROFILE_FIELDS } from "@/lib/handover";
import { clubText } from "@/lib/calendarHelpers";

type ChildRow = {
  id: string;
  name: string;
  basics: Record<string, string>;
  hub_carer_name: string;
  hub_carer_phone: string;
};
type Profile = Record<string, string>;
type AboutHousehold = { ssw_name: string; ssw_phone: string; ssw_email: string };
type SchoolAdmin = Record<string, string>;
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

const CLUB_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Deliberately excludes homework_app_login -- same rule as the export note
// below already states for card PINs/passwords/DOB: nothing that could let
// someone into an account travels in a document that leaves the house.
const SCHOOL_ADMIN_EXPORT_FIELDS: [string, string][] = [
  ["lunch_payment", "Paying for school lunches"],
  ["homework_app_name", "Homework app/website"],
  ["homework_app_url", "Homework app link"],
  ["class_rep_name", "Class rep"],
  ["class_rep_contact", "Class rep contact"],
  ["pta_name", "PTA / friends of school"],
  ["pta_contact", "PTA contact"],
  ["pta_facebook", "PTA Facebook / social group"],
  ["school_office_contact", "School office"],
  ["other_links", "Other useful links"],
  ["notes", "Notes"],
];

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
// "Key contacts at school" is a repeatable list (see lib/basics.ts), stored
// as a JSON-array string -- not read as plain text like every other basics
// field, so it needs parsing before it's fit to drop into a sentence.
function formatSchoolContacts(raw: string): string {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return "";
    return parsed
      .map((c: { name?: string; phone?: string; email?: string }) =>
        [c.name, [c.phone, c.email].filter(Boolean).join(" / ")].filter(Boolean).join(" — "),
      )
      .filter(Boolean)
      .join("; ");
  } catch {
    return raw;
  }
}

function suggestProfile(child: ChildRow): Partial<Profile> {
  const b = child.basics || {};
  const health = [b.gp && `GP: ${b.gp}`, b.allergies && `Allergies/medication: ${b.allergies}`, b.nhs && `NHS number: ${b.nhs}`]
    .filter(Boolean)
    .join("\n");
  const schoolContacts = formatSchoolContacts(b.teacher || "");
  const school = [b.school && `School: ${b.school}`, schoolContacts && `Key contact: ${schoolContacts}`].filter(Boolean).join("\n");
  const food = [b.food_likes && `Likes: ${b.food_likes}`, b.food_dislikes && `Dislikes: ${b.food_dislikes}`].filter(Boolean).join("\n");
  const nogo = [b.nocontact && `Must NOT have contact: ${b.nocontact}`, b.photos && `Photo/social media: ${b.photos}`]
    .filter(Boolean)
    .join("\n");
  return { health, school, food, contact: b.contact || "", nogo };
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
  const [fosteredChildren, setFosteredChildren] = useState<ChildRow[]>([]);
  const [householdChildren, setHouseholdChildren] = useState<ChildRow[]>([]);
  // A sleepover/handover plan can include a household child (own/adopted/SGO/
  // kinship) alongside a fostered one -- everywhere below just reads `children`.
  const children = [...fosteredChildren, ...householdChildren];
  const [selected, setSelected] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [schoolAdmin, setSchoolAdmin] = useState<Record<string, SchoolAdmin>>({});
  const [clubsByChild, setClubsByChild] = useState<Record<string, Club[]>>({});
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
    const [{ data: kids }, { data: hhKids }, { data: profileRows }, { data: hh }, { data: schoolAdminRows }, { data: clubRows }] =
      await Promise.all([
        supabase.from("children").select("id, name, basics, hub_carer_name, hub_carer_phone").order("created_at"),
        supabase.from("household_children").select("id, name, basics, hub_carer_name, hub_carer_phone").order("created_at"),
        supabase.from("handover_child_profiles").select("*"),
        supabase
          .from("household")
          .select("ssw_name, ssw_phone, ssw_email, csw, edt, gp, hub, school_contact, delegated, carseat")
          .maybeSingle(),
        supabase.from("child_school_admin").select("*"),
        supabase.from("child_clubs").select("*").order("weekday"),
      ]);
    const normalise = (rows: (ChildRow & { basics: Record<string, string> | null })[] | null) =>
      (rows ?? []).map((c) => ({ ...c, basics: c.basics || {} }));
    setFosteredChildren(normalise(kids as (ChildRow & { basics: Record<string, string> | null })[] | null));
    setHouseholdChildren(normalise(hhKids as (ChildRow & { basics: Record<string, string> | null })[] | null));
    if (hh) setAboutHousehold({ ssw_name: hh.ssw_name || "", ssw_phone: hh.ssw_phone || "", ssw_email: hh.ssw_email || "" });
    const byChild: Record<string, Profile> = {};
    (profileRows ?? []).forEach((p: Profile & { child_id: string }) => (byChild[p.child_id] = p));
    setProfiles(byChild);
    if (hh) setHousehold({ ...blankHousehold(), ...hh });
    const bySchoolAdmin: Record<string, SchoolAdmin> = {};
    (schoolAdminRows ?? []).forEach((r: SchoolAdmin & { child_id: string }) => (bySchoolAdmin[r.child_id] = r));
    setSchoolAdmin(bySchoolAdmin);
    const byClubs: Record<string, Club[]> = {};
    (clubRows as (Club & { child_id: string })[] | null)?.forEach((c) => {
      (byClubs[c.child_id] ||= []).push(c);
    });
    setClubsByChild(byClubs);
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
    const sa = child ? schoolAdmin[child.id] : undefined;
    const childClubs = child ? clubsByChild[child.id] || [] : [];
    const schoolAdminTable = sa
      ? `<h3>2a. ${n} — school admin</h3><table>${SCHOOL_ADMIN_EXPORT_FIELDS.map(([k, label]) => row(label, sa[k] || "")).join("")}</table>`
      : "";
    const clubsTable = childClubs.length
      ? `<h3>2b. ${n} — clubs</h3><table>${childClubs
          .map((c) =>
            row(
              CLUB_WEEKDAYS[c.weekday] || "",
              [clubText(c.club_name, c.time_from, c.time_to), c.cost, c.website, c.contact_name && `Contact: ${c.contact_name}${c.contact_info ? " " + c.contact_info : ""}`, c.notes]
                .filter(Boolean)
                .join(" — "),
            ),
          )
          .join("")}</table>`
      : "";
    return `<h3>2. ${n} — needs & routines</h3><table>${PROFILE_FIELDS.map(([k, label, hint]) => row(label, p[k], hint)).join("")}</table>${schoolAdminTable}${clubsTable}`;
  })
  .join("")}
<h3>3. Contacts, health & consents</h3><table>${HOUSEHOLD_FIELDS.map(([k, label, hint]) => row(label, householdOf()[k], hint)).join("")}</table>
<p><i>Do not include card PINs, passwords, homework-app logins or full dates of birth — hand these over in person.</i></p></body></html>`;
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
            {(schoolAdmin[child.id] || clubsByChild[child.id]?.length) && (
              <div className="note">
                <b>From School admin / Clubs (About us)</b>
                {schoolAdmin[child.id] &&
                  SCHOOL_ADMIN_EXPORT_FIELDS.filter(([k]) => schoolAdmin[child.id][k]?.trim()).map(([k, label]) => (
                    <div key={k} style={{ marginTop: 4 }}>
                      <b>{label}:</b> {schoolAdmin[child.id][k]}
                    </div>
                  ))}
                {(clubsByChild[child.id] ?? []).map((c) => (
                  <div key={c.id} style={{ marginTop: 4 }}>
                    <b>{CLUB_WEEKDAYS[c.weekday]}:</b> {clubText(c.club_name, c.time_from, c.time_to)}
                    {c.contact_name ? ` · ${c.contact_name}` : ""}
                  </div>
                ))}
                <p className="hint" style={{ marginTop: 6 }}>
                  Edit these in About us. The homework app login isn&apos;t included here or in the exported
                  document — hand that over separately.
                </p>
              </div>
            )}
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
