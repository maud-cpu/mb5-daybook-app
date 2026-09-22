"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BASICS_SECTIONS, RepeatableSubfield } from "@/lib/basics";
import { Child, GENDER_OPTIONS, LIVES_CATS, livesHereOf, MB_OPTIONS, VISITS_CATS } from "@/lib/types";
import { personColor } from "@/lib/calendarHelpers";
import ChildSchoolAdmin from "@/components/ChildSchoolAdmin";
import ChildClubs from "@/components/ChildClubs";
import RadialWheel, { WheelNode } from "@/components/RadialWheel";

const ADULT_ROLES = ["Foster carer", "Adult child", "Live-in grandparent", "Other"];
const VISITOR_ROLES = ["Mockingbird hub carer", "Respite support worker", "Family friend / helper", "Other"];

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "?";
}

// A name alone isn't a reliable signal of pronouns -- asking once here lets
// generated documents (Handover, diary drafts) get it right instead of
// guessing from the name and sometimes getting it wrong.
function GenderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— gender —</option>
      {GENDER_OPTIONS.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}

type RepeatableItem = Record<string, string> & { _k: string };

// A field stored as JSON in basics[key] instead of a plain string -- an open-ended
// list of contacts, or extra dates, where a single free-text box wouldn't stretch.
// A pre-existing plain-text value (from before a field became repeatable) is kept
// as the first item's first subfield rather than silently discarded.
function parseRepeatableItems(raw: string, subfields: RepeatableSubfield[]): RepeatableItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed.map((it) => ({ ...it, _k: crypto.randomUUID() }));
  } catch {
    if (raw) return [{ [subfields[0].key]: raw, _k: crypto.randomUUID() }];
  }
  return [];
}

function RepeatableField({
  value,
  onChange,
  subfields,
  addLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  subfields: RepeatableSubfield[];
  addLabel: string;
}) {
  const [items, setItems] = useState<RepeatableItem[]>(() => parseRepeatableItems(value, subfields));

  function persist(next: RepeatableItem[]) {
    setItems(next);
    onChange(JSON.stringify(next.map((it) => Object.fromEntries(Object.entries(it).filter(([k]) => k !== "_k")))));
  }

  return (
    <div style={{ marginTop: 6 }}>
      {items.map((it, i) => (
        <div className="row" key={it._k} style={{ marginTop: i ? 6 : 0 }}>
          {subfields.map((sf) => (
            <input
              key={sf.key}
              type={sf.type || "text"}
              placeholder={sf.label}
              defaultValue={it[sf.key] || ""}
              onBlur={(e) => persist(items.map((x) => (x._k === it._k ? { ...x, [sf.key]: e.target.value } : x)))}
            />
          ))}
          <button className="x" onClick={() => persist(items.filter((x) => x._k !== it._k))}>
            ×
          </button>
        </div>
      ))}
      <button className="chip add" style={{ marginTop: 6 }} onClick={() => persist([...items, { _k: crypto.randomUUID() }])}>
        + {addLabel}
      </button>
    </div>
  );
}

function YesNoChecklist({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: string[] }) {
  let state: Record<string, string> = {};
  try {
    const parsed = JSON.parse(value || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed;
  } catch {
    // a pre-existing plain-text value can't be safely split into per-item answers -- leave everything unset
  }
  return (
    <div style={{ marginTop: 6 }}>
      {items.map((item) => (
        <div className="row" key={item} style={{ marginTop: 4, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{item}</span>
          <select
            style={{ flex: "0 0 110px" }}
            value={state[item] || ""}
            onChange={(e) => onChange(JSON.stringify({ ...state, [item]: e.target.value }))}
          >
            <option value="">— not set —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      ))}
    </div>
  );
}

type Adult = { id: string; name: string; phone: string; email: string; role: string; gender: string };
type HouseholdChild = {
  id: string;
  name: string;
  born: string | null;
  category: string;
  notes: string;
  basics: Record<string, string>;
  mockingbird: string;
  hub_carer_name: string;
  hub_carer_phone: string;
  hub_carer_email: string;
  surrey_contact: string;
  gender: string;
};

// Shared by every list a child can appear in (lives here, visits, or in your
// household but not an active placement) -- Mockingbird/hub-carer details,
// the Surrey contact for an SGO/adopted child, and the full basics form.
// Kept in one place so the three lists can't quietly drift out of sync.
function ChildBasicsPanel({
  showMockingbird,
  mockingbird,
  onMockingbird,
  hubCarerName,
  hubCarerPhone,
  hubCarerEmail,
  onHubCarer,
  showSurreyContact,
  surreyContact,
  onSurreyContact,
  basics,
  onBasics,
}: {
  showMockingbird: boolean;
  mockingbird: string;
  onMockingbird: (v: string) => void;
  hubCarerName: string;
  hubCarerPhone: string;
  hubCarerEmail: string;
  onHubCarer: (field: "hub_carer_name" | "hub_carer_phone" | "hub_carer_email", v: string) => void;
  showSurreyContact: boolean;
  surreyContact: string;
  onSurreyContact: (v: string) => void;
  basics: Record<string, string>;
  onBasics: (key: string, value: string) => void;
}) {
  return (
    <>
      {showMockingbird && (
        <>
          <p className="hint" style={{ marginTop: 8 }}>
            Mockingbird
          </p>
          <select value={mockingbird} onChange={(e) => onMockingbird(e.target.value)}>
            <option value="">— not set —</option>
            {MB_OPTIONS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {["mb5", "another"].includes(mockingbird) && (
            <>
              <p className="hint" style={{ marginTop: 6 }}>
                Hub carer name
              </p>
              <input defaultValue={hubCarerName} onBlur={(e) => onHubCarer("hub_carer_name", e.target.value)} />
              <p className="hint" style={{ marginTop: 6 }}>
                Hub carer phone
              </p>
              <input type="tel" defaultValue={hubCarerPhone} onBlur={(e) => onHubCarer("hub_carer_phone", e.target.value)} />
              <p className="hint" style={{ marginTop: 6 }}>
                Hub carer email
              </p>
              <input type="email" defaultValue={hubCarerEmail} onBlur={(e) => onHubCarer("hub_carer_email", e.target.value)} />
            </>
          )}
        </>
      )}
      {showSurreyContact && (
        <>
          <p className="hint" style={{ marginTop: 8 }}>
            Important contact at Surrey
          </p>
          <textarea
            placeholder="Name · phone · email"
            defaultValue={surreyContact}
            onBlur={(e) => onSurreyContact(e.target.value)}
          />
        </>
      )}
      {BASICS_SECTIONS.map((section) => (
        <div key={section.title} style={{ marginBottom: 12, marginTop: 12 }}>
          <b style={{ fontSize: 14 }}>{section.title}</b>
          {section.fields.map((f) =>
            f.repeatableFields ? (
              <div key={f.key} style={{ marginTop: 10 }}>
                <small className="muted">{f.label}</small>
                <RepeatableField
                  value={basics[f.key] || ""}
                  onChange={(v) => onBasics(f.key, v)}
                  subfields={f.repeatableFields}
                  addLabel={f.addLabel || "add another"}
                />
              </div>
            ) : f.checklist ? (
              <div key={f.key} style={{ marginTop: 10 }}>
                <small className="muted">{f.label}</small>
                <YesNoChecklist value={basics[f.key] || ""} onChange={(v) => onBasics(f.key, v)} items={f.checklist} />
              </div>
            ) : f.select ? (
              <select
                key={f.key}
                style={{ marginTop: 6 }}
                value={basics[f.key] || ""}
                onChange={(e) => onBasics(f.key, e.target.value)}
              >
                <option value="">{f.label}…</option>
                {f.select.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                key={f.key}
                type={f.type || "text"}
                style={{ marginTop: 6 }}
                placeholder={f.placeholder ? `${f.label} — ${f.placeholder}` : f.label}
                defaultValue={basics[f.key] || ""}
                onBlur={(e) => onBasics(f.key, e.target.value)}
              />
            ),
          )}
        </div>
      ))}
    </>
  );
}
type Visitor = { id: string; name: string; phone: string; email: string; role: string; gender: string };

type Household = {
  ssw_name: string;
  ssw_phone: string;
  ssw_email: string;
  ssw_manager_name: string;
  ssw_manager_phone: string;
  ssw_manager_email: string;
  edt: string;
  is_mockingbird: boolean | null;
  hub_leader_name: string;
  hub_leader_phone: string;
  hub_leader_email: string;
};

const emptyHousehold: Household = {
  ssw_name: "",
  ssw_phone: "",
  ssw_email: "",
  ssw_manager_name: "",
  ssw_manager_phone: "",
  ssw_manager_email: "",
  edt: "",
  is_mockingbird: null,
  hub_leader_name: "",
  hub_leader_phone: "",
  hub_leader_email: "",
};

const CENTER_COLOR = "#1f5e52";
const SSW_COLOR = "#96712f";
const ADD_HH_CHILD = "add-household-child";
const ADD_VISIT_CHILD = "add-visiting-child";
const ADD_VISITOR = "add-visitor";
const SSW_NODE = "ssw";
const CENTER_NODE = "center";

export default function AboutScreen() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [basics, setBasics] = useState<Record<string, Record<string, string>>>({});
  const [household, setHousehold] = useState<Household>(emptyHousehold);
  const [adults, setAdults] = useState<Adult[]>([]);
  const [newAdult, setNewAdult] = useState({ name: "", phone: "", email: "", role: ADULT_ROLES[0], gender: "" });
  const [householdChildren, setHouseholdChildren] = useState<HouseholdChild[]>([]);
  const [newHouseholdChild, setNewHouseholdChild] = useState({ name: "", born: "", category: "", notes: "", gender: "" });
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [newVisitor, setNewVisitor] = useState({ name: "", phone: "", email: "", role: VISITOR_ROLES[0], gender: "" });
  const [newVisitingChild, setNewVisitingChild] = useState({ name: "", born: "", category: VISITS_CATS[0][0] as string, gender: "" });
  const [openSchoolAdmin, setOpenSchoolAdmin] = useState<string | null>(null);
  const [openClubs, setOpenClubs] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const [{ data: kids }, { data: hh }, { data: adultRows }, { data: householdChildRows }, { data: visitorRows }] = await Promise.all([
      supabase
        .from("children")
        .select(
          "id, name, born, family, basics, category, lives_here, mockingbird, hub_carer_name, hub_carer_phone, hub_carer_email, surrey_contact, gender",
        )
        .order("created_at"),
      supabase.from("household").select("*").maybeSingle(),
      supabase.from("household_adults").select("*").order("created_at"),
      supabase.from("household_children").select("*").order("created_at"),
      supabase.from("household_visitors").select("*").order("created_at"),
    ]);
    setHouseholdChildren((householdChildRows as HouseholdChild[]) ?? []);
    setVisitors((visitorRows as Visitor[]) ?? []);
    const list = (kids as (Child & { basics: Record<string, string> })[]) ?? [];
    setChildren(list);
    const b: Record<string, Record<string, string>> = {};
    list.forEach((c) => (b[c.id] = c.basics || {}));
    setBasics(b);
    if (hh) setHousehold(hh as Household);
    setAdults((adultRows as Adult[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveHousehold(patch: Partial<Household>) {
    const next = { ...household, ...patch };
    setHousehold(next);
    await supabase.from("household").upsert({ ...next, updated_at: new Date().toISOString() });
    flashSaved();
  }

  // A "next" statutory review/visit date should show up on the calendar and stay a
  // single entry as it's updated, rather than piling up a new one each time -- keyed
  // by source_key so this is an upsert, not an insert. Clearing the date removes it.
  async function syncKeyDateReminder(childId: string, childName: string, key: string, value: string) {
    if (key !== "review_next" && key !== "visit_next") return;
    const sourceKey = `${key === "review_next" ? "review" : "visit"}:${childId}`;
    if (!value) {
      await supabase.from("reminders").delete().eq("source_key", sourceKey);
      return;
    }
    const label = key === "review_next" ? "CLA review" : "SW statutory visit";
    await supabase.from("reminders").upsert(
      {
        source_key: sourceKey,
        text: `${childName ? childName + "'s " : ""}${label}`,
        date: value,
        category: "surrey",
        people: childName ? [childName] : [],
        done: false,
        done_at: null,
      },
      { onConflict: "user_id,source_key" },
    );
  }

  async function saveChildBasics(childId: string, key: string, value: string) {
    const next = { ...(basics[childId] || {}), [key]: value };
    setBasics((prev) => ({ ...prev, [childId]: next }));
    await supabase.from("children").update({ basics: next }).eq("id", childId);
    syncKeyDateReminder(childId, children.find((c) => c.id === childId)?.name || "", key, value);
    flashSaved();
  }

  async function saveChild(childId: string, patch: Partial<Child>) {
    setChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, ...patch } : c)));
    await supabase.from("children").update(patch).eq("id", childId);
    flashSaved();
  }

  async function removeChild(childId: string, name: string) {
    if (!confirm(`Remove ${name || "this child"}? Their diary entries and other records are kept, just no longer linked to a child in this list.`)) return;
    setChildren((prev) => prev.filter((c) => c.id !== childId));
    await supabase.from("children").delete().eq("id", childId);
    setSelected(null);
  }

  async function saveHouseholdChildBasics(childId: string, key: string, value: string) {
    const next = { ...(householdChildren.find((c) => c.id === childId)?.basics || {}), [key]: value };
    setHouseholdChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, basics: next } : c)));
    await supabase.from("household_children").update({ basics: next }).eq("id", childId);
    syncKeyDateReminder(childId, householdChildren.find((c) => c.id === childId)?.name || "", key, value);
    flashSaved();
  }

  function flashSaved() {
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  async function addAdult() {
    if (!newAdult.name.trim()) return;
    await supabase.from("household_adults").insert(newAdult);
    setNewAdult({ name: "", phone: "", email: "", role: ADULT_ROLES[0], gender: "" });
    await load();
  }

  async function updateAdult(id: string, patch: Partial<Adult>) {
    setAdults((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    await supabase.from("household_adults").update(patch).eq("id", id);
  }

  async function removeAdult(id: string) {
    setAdults((prev) => prev.filter((a) => a.id !== id));
    await supabase.from("household_adults").delete().eq("id", id);
  }

  async function addHouseholdChild() {
    if (!newHouseholdChild.name.trim()) return;
    await supabase.from("household_children").insert({ ...newHouseholdChild, born: newHouseholdChild.born || null });
    setNewHouseholdChild({ name: "", born: "", category: "", notes: "", gender: "" });
    setSelected(null);
    await load();
  }

  async function updateHouseholdChild(id: string, patch: Partial<HouseholdChild>) {
    setHouseholdChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from("household_children").update(patch).eq("id", id);
  }

  async function removeHouseholdChild(id: string) {
    setHouseholdChildren((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("household_children").delete().eq("id", id);
    setSelected(null);
  }

  async function addVisitor() {
    if (!newVisitor.name.trim()) return;
    await supabase.from("household_visitors").insert(newVisitor);
    setNewVisitor({ name: "", phone: "", email: "", role: VISITOR_ROLES[0], gender: "" });
    setSelected(null);
    await load();
  }

  async function updateVisitor(id: string, patch: Partial<Visitor>) {
    setVisitors((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    await supabase.from("household_visitors").update(patch).eq("id", id);
  }

  async function removeVisitor(id: string) {
    setVisitors((prev) => prev.filter((v) => v.id !== id));
    await supabase.from("household_visitors").delete().eq("id", id);
    setSelected(null);
  }

  async function addVisitingChild() {
    if (!newVisitingChild.name.trim()) return;
    await supabase.from("children").insert({
      name: newVisitingChild.name.trim(),
      born: newVisitingChild.born || null,
      category: newVisitingChild.category,
      lives_here: false,
      gender: newVisitingChild.gender,
    });
    setNewVisitingChild({ name: "", born: "", category: VISITS_CATS[0][0], gender: "" });
    setSelected(null);
    await load();
  }

  const livingChildren = children.filter((c) => livesHereOf(c) !== false);
  const visitingChildren = children.filter((c) => livesHereOf(c) === false);
  const carerAdults = adults.filter((a) => a.role === "Foster carer");

  const centerLabel = carerAdults.length ? carerAdults.map((a) => firstName(a.name)).join(" & ") : "+ Add carer";
  const householdCenter: WheelNode = { id: CENTER_NODE, label: centerLabel, color: CENTER_COLOR };

  const householdRing: WheelNode[] = [
    ...livingChildren.map((c) => ({ id: `child:${c.id}`, label: firstName(c.name), color: personColor(c.name) })),
    ...householdChildren.map((c) => ({ id: `hh:${c.id}`, label: firstName(c.name), color: personColor(c.name) })),
    { id: ADD_HH_CHILD, label: "+", color: "", dashed: true },
  ];

  // A separate, non-touching wheel -- people who visit regularly aren't
  // part of the household, so they don't belong orbiting the same centre.
  const visitorsCenter: WheelNode = { id: "visitors-hub", label: "Visitors", color: SSW_COLOR };
  const visitorsRing: WheelNode[] = [
    ...visitingChildren.map((c) => ({ id: `visit:${c.id}`, label: firstName(c.name), color: personColor(c.name) })),
    ...visitors.map((v) => ({ id: `visitor:${v.id}`, label: firstName(v.name), color: SSW_COLOR })),
    { id: SSW_NODE, label: household.ssw_name ? firstName(household.ssw_name) : "SSW", color: SSW_COLOR },
    { id: ADD_VISIT_CHILD, label: "+ child", color: "", dashed: true },
    { id: ADD_VISITOR, label: "+ adult", color: "", dashed: true },
  ];

  function closeButton() {
    return (
      <button className="chip" style={{ marginTop: 10 }} onClick={() => setSelected(null)}>
        ← Back to everyone
      </button>
    );
  }

  function renderSelected() {
    if (!selected) return null;

    if (selected === CENTER_NODE) {
      return (
        <div className="card">
          <h3>Adults in your household</h3>
          <p className="hint">Everyone in the household — so it&apos;s all in one place, not scattered across contacts.</p>
          {adults.map((a) => (
            <div className="item" key={a.id}>
              <div className="row">
                <input value={a.name} onChange={(e) => updateAdult(a.id, { name: e.target.value })} />
                <select value={a.role} onChange={(e) => updateAdult(a.id, { role: e.target.value })}>
                  {ADULT_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className="x" onClick={() => removeAdult(a.id)}>
                  ×
                </button>
              </div>
              <div className="row">
                <input placeholder="Phone" value={a.phone} onChange={(e) => updateAdult(a.id, { phone: e.target.value })} />
                <input placeholder="Email" value={a.email} onChange={(e) => updateAdult(a.id, { email: e.target.value })} />
                <GenderSelect value={a.gender} onChange={(v) => updateAdult(a.id, { gender: v })} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <input placeholder="Name" value={newAdult.name} onChange={(e) => setNewAdult({ ...newAdult, name: e.target.value })} />
            <div className="row" style={{ marginTop: 6 }}>
              <input placeholder="Phone" value={newAdult.phone} onChange={(e) => setNewAdult({ ...newAdult, phone: e.target.value })} />
              <input placeholder="Email" value={newAdult.email} onChange={(e) => setNewAdult({ ...newAdult, email: e.target.value })} />
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <select value={newAdult.role} onChange={(e) => setNewAdult({ ...newAdult, role: e.target.value })}>
                {ADULT_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <GenderSelect value={newAdult.gender} onChange={(v) => setNewAdult({ ...newAdult, gender: v })} />
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addAdult}>
                + Add adult
              </button>
            </div>
          </div>

          <h3 style={{ marginTop: 18 }}>Your Mockingbird</h3>
          <p className="hint">Are you part of a Mockingbird constellation?</p>
          <select
            value={household.is_mockingbird === null ? "" : household.is_mockingbird ? "1" : "0"}
            onChange={(e) => saveHousehold({ is_mockingbird: e.target.value === "" ? null : e.target.value === "1" })}
          >
            <option value="">— not set —</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
          {household.is_mockingbird && (
            <div className="row" style={{ marginTop: 8 }}>
              <input
                placeholder="Hub leader name"
                value={household.hub_leader_name}
                onChange={(e) => saveHousehold({ hub_leader_name: e.target.value })}
              />
              <input
                placeholder="Hub leader phone"
                value={household.hub_leader_phone}
                onChange={(e) => saveHousehold({ hub_leader_phone: e.target.value })}
              />
              <input
                placeholder="Hub leader email"
                value={household.hub_leader_email}
                onChange={(e) => saveHousehold({ hub_leader_email: e.target.value })}
              />
            </div>
          )}
          {savedAt && <p className="hint">Saved {savedAt}</p>}
          {closeButton()}
        </div>
      );
    }

    if (selected === SSW_NODE) {
      return (
        <div className="card">
          <h3>Your supervising social worker</h3>
          <div className="row">
            <input placeholder="SSW name" value={household.ssw_name} onChange={(e) => saveHousehold({ ssw_name: e.target.value })} />
            <input placeholder="SSW phone" value={household.ssw_phone} onChange={(e) => saveHousehold({ ssw_phone: e.target.value })} />
          </div>
          <input placeholder="SSW email" value={household.ssw_email} onChange={(e) => saveHousehold({ ssw_email: e.target.value })} />
          <div className="row" style={{ marginTop: 10 }}>
            <input
              placeholder="SSW's manager name"
              value={household.ssw_manager_name}
              onChange={(e) => saveHousehold({ ssw_manager_name: e.target.value })}
            />
            <input
              placeholder="SSW's manager phone"
              value={household.ssw_manager_phone}
              onChange={(e) => saveHousehold({ ssw_manager_phone: e.target.value })}
            />
          </div>
          <label style={{ marginTop: 10, display: "block" }}>Emergency Duty Team (out-of-hours) number</label>
          <input value={household.edt} onChange={(e) => saveHousehold({ edt: e.target.value })} />
          {savedAt && <p className="hint">Saved {savedAt}</p>}
          {closeButton()}
        </div>
      );
    }

    if (selected === ADD_HH_CHILD) {
      return (
        <div className="card">
          <h3>Add a child in your household</h3>
          <p className="hint">
            A child living here who isn&apos;t an active fostering placement — your own, adopted, kinship, SGO, or a
            child who themselves fosters. New foster placements are added from Capture.
          </p>
          <div className="row">
            <input
              placeholder="Name"
              value={newHouseholdChild.name}
              onChange={(e) => setNewHouseholdChild({ ...newHouseholdChild, name: e.target.value })}
            />
            <input
              type="date"
              style={{ flex: "0 0 150px" }}
              value={newHouseholdChild.born}
              onChange={(e) => setNewHouseholdChild({ ...newHouseholdChild, born: e.target.value })}
            />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <select
              value={newHouseholdChild.category}
              onChange={(e) => setNewHouseholdChild({ ...newHouseholdChild, category: e.target.value })}
            >
              <option value="">— placement type —</option>
              {LIVES_CATS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input
              placeholder="Notes (optional)"
              value={newHouseholdChild.notes}
              onChange={(e) => setNewHouseholdChild({ ...newHouseholdChild, notes: e.target.value })}
            />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <GenderSelect value={newHouseholdChild.gender} onChange={(v) => setNewHouseholdChild({ ...newHouseholdChild, gender: v })} />
          </div>
          <button className="chip" style={{ marginTop: 8 }} onClick={addHouseholdChild}>
            + Add
          </button>
          {closeButton()}
        </div>
      );
    }

    if (selected === ADD_VISIT_CHILD) {
      return (
        <div className="card">
          <h3>Add a visiting child</h3>
          <p className="hint">Respite, daycare or sleepover — a child who visits but doesn&apos;t live here.</p>
          <div className="row">
            <input
              placeholder="Name"
              value={newVisitingChild.name}
              onChange={(e) => setNewVisitingChild({ ...newVisitingChild, name: e.target.value })}
            />
            <input
              type="date"
              style={{ flex: "0 0 150px" }}
              value={newVisitingChild.born}
              onChange={(e) => setNewVisitingChild({ ...newVisitingChild, born: e.target.value })}
            />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <select
              value={newVisitingChild.category}
              onChange={(e) => setNewVisitingChild({ ...newVisitingChild, category: e.target.value })}
            >
              {VISITS_CATS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <GenderSelect value={newVisitingChild.gender} onChange={(v) => setNewVisitingChild({ ...newVisitingChild, gender: v })} />
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={addVisitingChild}>
              + Add
            </button>
          </div>
          {closeButton()}
        </div>
      );
    }

    if (selected === ADD_VISITOR) {
      return (
        <div className="card">
          <h3>Add a visitor</h3>
          <p className="hint">An adult connected to the household who doesn&apos;t live here.</p>
          <input placeholder="Name" value={newVisitor.name} onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })} />
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="Phone" value={newVisitor.phone} onChange={(e) => setNewVisitor({ ...newVisitor, phone: e.target.value })} />
            <input placeholder="Email" value={newVisitor.email} onChange={(e) => setNewVisitor({ ...newVisitor, email: e.target.value })} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <select value={newVisitor.role} onChange={(e) => setNewVisitor({ ...newVisitor, role: e.target.value })}>
              {VISITOR_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <GenderSelect value={newVisitor.gender} onChange={(v) => setNewVisitor({ ...newVisitor, gender: v })} />
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={addVisitor}>
              + Add
            </button>
          </div>
          {closeButton()}
        </div>
      );
    }

    if (selected.startsWith("visitor:")) {
      const id = selected.slice("visitor:".length);
      const v = visitors.find((x) => x.id === id);
      if (!v) return null;
      return (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <h3 style={{ flex: 1, margin: 0 }}>{v.name || "Visitor"}</h3>
            <button className="x" onClick={() => removeVisitor(v.id)}>
              ×
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={v.name} onChange={(e) => updateVisitor(v.id, { name: e.target.value })} />
            <select value={v.role} onChange={(e) => updateVisitor(v.id, { role: e.target.value })}>
              {VISITOR_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <input placeholder="Phone" value={v.phone} onChange={(e) => updateVisitor(v.id, { phone: e.target.value })} />
            <input placeholder="Email" value={v.email} onChange={(e) => updateVisitor(v.id, { email: e.target.value })} />
            <GenderSelect value={v.gender} onChange={(val) => updateVisitor(v.id, { gender: val })} />
          </div>
          {closeButton()}
        </div>
      );
    }

    if (selected.startsWith("hh:")) {
      const id = selected.slice("hh:".length);
      const c = householdChildren.find((x) => x.id === id);
      if (!c) return null;
      const open = openSchoolAdmin === c.id;
      const clubsOpen = openClubs === c.id;
      return (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <h3 style={{ flex: 1, margin: 0 }}>{c.name || "Child"}</h3>
            <button className="x" onClick={() => removeHouseholdChild(c.id)}>
              ×
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={c.name} onChange={(e) => updateHouseholdChild(c.id, { name: e.target.value })} />
            <input
              type="date"
              style={{ flex: "0 0 150px" }}
              value={c.born || ""}
              onChange={(e) => updateHouseholdChild(c.id, { born: e.target.value || null })}
            />
          </div>
          <div className="row">
            <select value={c.category} onChange={(e) => updateHouseholdChild(c.id, { category: e.target.value })}>
              <option value="">— placement type —</option>
              {LIVES_CATS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input placeholder="Notes (optional)" value={c.notes} onChange={(e) => updateHouseholdChild(c.id, { notes: e.target.value })} />
          </div>
          <div className="row">
            <GenderSelect value={c.gender} onChange={(v) => updateHouseholdChild(c.id, { gender: v })} />
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            <button className="chip" onClick={() => setOpenSchoolAdmin(open ? null : c.id)}>
              🏫 School admin
            </button>
            <button className="chip" onClick={() => setOpenClubs(clubsOpen ? null : c.id)}>
              🧩 Clubs
            </button>
          </div>
          {open && <ChildSchoolAdmin childId={c.id} />}
          {clubsOpen && <ChildClubs childId={c.id} />}
          {c.category !== "fosters" && (
            <div style={{ marginTop: 10 }}>
              <ChildBasicsPanel
                showMockingbird={false}
                mockingbird={c.mockingbird}
                onMockingbird={(v) => updateHouseholdChild(c.id, { mockingbird: v })}
                hubCarerName={c.hub_carer_name}
                hubCarerPhone={c.hub_carer_phone}
                hubCarerEmail={c.hub_carer_email}
                onHubCarer={(field, v) => updateHouseholdChild(c.id, { [field]: v })}
                showSurreyContact={["sgo", "adopted"].includes(c.category)}
                surreyContact={c.surrey_contact}
                onSurreyContact={(v) => updateHouseholdChild(c.id, { surrey_contact: v })}
                basics={c.basics || {}}
                onBasics={(key, value) => saveHouseholdChildBasics(c.id, key, value)}
              />
            </div>
          )}
          {closeButton()}
        </div>
      );
    }

    if (selected.startsWith("visit:")) {
      const id = selected.slice("visit:".length);
      const c = children.find((x) => x.id === id);
      if (!c) return null;
      const cb = basics[c.id] || {};
      return (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <h3 style={{ flex: 1, margin: 0 }}>{c.name || "Child"}</h3>
            <button className="x" onClick={() => removeChild(c.id, c.name)}>
              ×
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={c.name} onChange={(e) => saveChild(c.id, { name: e.target.value })} />
            <input
              type="date"
              style={{ flex: "0 0 150px" }}
              value={c.born || ""}
              onChange={(e) => saveChild(c.id, { born: e.target.value || null })}
            />
          </div>
          <div className="row">
            <select value={c.category} onChange={(e) => saveChild(c.id, { category: e.target.value })}>
              <option value="">— placement type —</option>
              {VISITS_CATS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <GenderSelect value={c.gender} onChange={(v) => saveChild(c.id, { gender: v })} />
          </div>
          <div style={{ marginTop: 10 }}>
            <ChildBasicsPanel
              showMockingbird={true}
              mockingbird={c.mockingbird}
              onMockingbird={(v) => saveChild(c.id, { mockingbird: v })}
              hubCarerName={c.hub_carer_name}
              hubCarerPhone={c.hub_carer_phone}
              hubCarerEmail={c.hub_carer_email}
              onHubCarer={(field, v) => saveChild(c.id, { [field]: v })}
              showSurreyContact={["sgo", "adopted"].includes(c.category)}
              surreyContact={c.surrey_contact}
              onSurreyContact={(v) => saveChild(c.id, { surrey_contact: v })}
              basics={cb}
              onBasics={(key, value) => saveChildBasics(c.id, key, value)}
            />
          </div>
          {closeButton()}
        </div>
      );
    }

    if (selected.startsWith("child:")) {
      const id = selected.slice("child:".length);
      const c = children.find((x) => x.id === id);
      if (!c) return null;
      const cb = basics[c.id] || {};
      const open = openSchoolAdmin === c.id;
      const clubsOpen = openClubs === c.id;
      return (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <h3 style={{ flex: 1, margin: 0 }}>{c.name}</h3>
            <button className="x" onClick={() => removeChild(c.id, c.name)}>
              ×
            </button>
          </div>
          <div className="muted">
            {LIVES_CATS.find(([k]) => k === c.category)?.[1] ?? (c.lives_here === true ? "Lives with us" : "Not set yet")}
            {c.mockingbird ? " · " + (MB_OPTIONS.find(([k]) => k === c.mockingbird)?.[1] ?? c.mockingbird) : ""}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <GenderSelect value={c.gender} onChange={(v) => saveChild(c.id, { gender: v })} />
          </div>
          <div className="chips" style={{ marginTop: 6 }}>
            <button className="chip" onClick={() => setOpenSchoolAdmin(open ? null : c.id)}>
              🏫 School admin
            </button>
            <button className="chip" onClick={() => setOpenClubs(clubsOpen ? null : c.id)}>
              🧩 Clubs
            </button>
          </div>
          {open && <ChildSchoolAdmin childId={c.id} />}
          {clubsOpen && <ChildClubs childId={c.id} />}
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 14 }}>Living arrangement</b>
            <select
              style={{ marginTop: 6 }}
              value={c.lives_here === null || c.lives_here === undefined ? "" : c.lives_here ? "1" : "0"}
              onChange={(e) => saveChild(c.id, { lives_here: e.target.value === "1", category: "" })}
            >
              <option value="">— lives with us, or visits? —</option>
              <option value="1">Lives with us</option>
              <option value="0">Visits (sleepover / daycare / short break)</option>
            </select>
            {c.lives_here === true && (
              <select style={{ marginTop: 6 }} value={c.category} onChange={(e) => saveChild(c.id, { category: e.target.value })}>
                <option value="">— placement type —</option>
                {LIVES_CATS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            {c.category === "fosters" ? (
              <>
                <p className="hint" style={{ marginTop: 8 }}>
                  Notes
                </p>
                <textarea
                  placeholder="Anything worth noting — no CSW/health/education details needed for a child who themselves fosters"
                  defaultValue={cb.notes || ""}
                  onBlur={(e) => saveChildBasics(c.id, "notes", e.target.value)}
                />
              </>
            ) : (
              <ChildBasicsPanel
                // A child confirmed as living in this household is automatically part of
                // whichever Mockingbird constellation the household itself belongs to (see
                // "Your Mockingbird" above) -- no need to ask again per child. Left showing
                // for "not set yet" since we don't know their living arrangement yet.
                showMockingbird={c.lives_here !== true}
                mockingbird={c.mockingbird}
                onMockingbird={(v) => saveChild(c.id, { mockingbird: v })}
                hubCarerName={c.hub_carer_name}
                hubCarerPhone={c.hub_carer_phone}
                hubCarerEmail={c.hub_carer_email}
                onHubCarer={(field, v) => saveChild(c.id, { [field]: v })}
                showSurreyContact={["sgo", "adopted"].includes(c.category)}
                surreyContact={c.surrey_contact}
                onSurreyContact={(v) => saveChild(c.id, { surrey_contact: v })}
                basics={cb}
                onBasics={(key, value) => saveChildBasics(c.id, key, value)}
              />
            )}
          </div>
          {closeButton()}
        </div>
      );
    }

    return null;
  }

  return (
    <div>
      <div className="card">
        <h3>About us</h3>
        <p className="hint">
          Your household on the left, people who visit regularly on the right. Tap a circle to see and edit their
          details.
        </p>
        <div className="about-wheels">
          <RadialWheel
            center={householdCenter}
            ring1={householdRing}
            selectedId={selected}
            onSelect={setSelected}
            maxWidth="380px"
          />
          <RadialWheel
            center={visitorsCenter}
            ring1={visitorsRing}
            selectedId={selected}
            onSelect={setSelected}
            maxWidth="380px"
          />
        </div>
      </div>

      {children.length === 0 && householdChildren.length === 0 && (
        <div className="card">
          <p className="empty">No children added yet — add one from the Capture tab, or the + circle above.</p>
        </div>
      )}

      {renderSelected()}
    </div>
  );
}
