"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BASICS_SECTIONS } from "@/lib/basics";
import { Child, LIVES_CATS, livesHereOf, MB_OPTIONS, VISITS_CATS } from "@/lib/types";

const ADULT_ROLES = ["Foster carer", "Adult child", "Live-in grandparent", "Other"];
const VISITOR_ROLES = ["Mockingbird hub carer", "Respite support worker", "Family friend / helper", "Other"];

function categoryLabel(cat: string): string {
  return [...LIVES_CATS, ...VISITS_CATS].find(([k]) => k === cat)?.[1] || cat;
}

type Adult = { id: string; name: string; phone: string; email: string; role: string };
type HouseholdChild = { id: string; name: string; born: string | null; notes: string };
type Visitor = { id: string; name: string; phone: string; email: string; role: string };

type Household = {
  ssw_name: string;
  ssw_phone: string;
  ssw_email: string;
  ssw_manager_name: string;
  ssw_manager_phone: string;
  ssw_manager_email: string;
  edt: string;
};

const emptyHousehold: Household = {
  ssw_name: "",
  ssw_phone: "",
  ssw_email: "",
  ssw_manager_name: "",
  ssw_manager_phone: "",
  ssw_manager_email: "",
  edt: "",
};

export default function AboutScreen() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [basics, setBasics] = useState<Record<string, Record<string, string>>>({});
  const [household, setHousehold] = useState<Household>(emptyHousehold);
  const [adults, setAdults] = useState<Adult[]>([]);
  const [addingAdult, setAddingAdult] = useState(false);
  const [newAdult, setNewAdult] = useState({ name: "", phone: "", email: "", role: ADULT_ROLES[0] });
  const [householdChildren, setHouseholdChildren] = useState<HouseholdChild[]>([]);
  const [addingHouseholdChild, setAddingHouseholdChild] = useState(false);
  const [newHouseholdChild, setNewHouseholdChild] = useState({ name: "", born: "", notes: "" });
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [newVisitor, setNewVisitor] = useState({ name: "", phone: "", email: "", role: VISITOR_ROLES[0] });
  const [openChild, setOpenChild] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState("");

  async function load() {
    const [{ data: kids }, { data: hh }, { data: adultRows }, { data: householdChildRows }, { data: visitorRows }] = await Promise.all([
      supabase
        .from("children")
        .select("id, name, born, family, basics, category, lives_here, mockingbird, hub_carer_name, hub_carer_phone, hub_carer_email, surrey_contact")
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

  async function saveChildBasics(childId: string, key: string, value: string) {
    const next = { ...(basics[childId] || {}), [key]: value };
    setBasics((prev) => ({ ...prev, [childId]: next }));
    await supabase.from("children").update({ basics: next }).eq("id", childId);
    flashSaved();
  }

  async function saveChild(childId: string, patch: Partial<Child>) {
    setChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, ...patch } : c)));
    await supabase.from("children").update(patch).eq("id", childId);
    flashSaved();
  }

  function flashSaved() {
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  async function addAdult() {
    if (!newAdult.name.trim()) return;
    await supabase.from("household_adults").insert(newAdult);
    setNewAdult({ name: "", phone: "", email: "", role: ADULT_ROLES[0] });
    setAddingAdult(false);
    load();
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
    setNewHouseholdChild({ name: "", born: "", notes: "" });
    setAddingHouseholdChild(false);
    load();
  }

  async function updateHouseholdChild(id: string, patch: Partial<HouseholdChild>) {
    setHouseholdChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from("household_children").update(patch).eq("id", id);
  }

  async function removeHouseholdChild(id: string) {
    setHouseholdChildren((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("household_children").delete().eq("id", id);
  }

  async function addVisitor() {
    if (!newVisitor.name.trim()) return;
    await supabase.from("household_visitors").insert(newVisitor);
    setNewVisitor({ name: "", phone: "", email: "", role: VISITOR_ROLES[0] });
    setAddingVisitor(false);
    load();
  }

  async function updateVisitor(id: string, patch: Partial<Visitor>) {
    setVisitors((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    await supabase.from("household_visitors").update(patch).eq("id", id);
  }

  async function removeVisitor(id: string) {
    setVisitors((prev) => prev.filter((v) => v.id !== id));
    await supabase.from("household_visitors").delete().eq("id", id);
  }

  return (
    <div>
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
            </div>
          </div>
        ))}
        {addingAdult ? (
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
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addAdult}>
                Add
              </button>
              <button className="x" onClick={() => setAddingAdult(false)}>
                ×
              </button>
            </div>
          </div>
        ) : (
          <button className="chip add" onClick={() => setAddingAdult(true)}>
            + adult
          </button>
        )}
      </div>

      <div className="card">
        <h3>Your own children living here</h3>
        <p className="hint">Your birth or adopted children in the household — not in placement, so separate from the children list below.</p>
        {householdChildren.map((c) => (
          <div className="item" key={c.id}>
            <div className="row">
              <input value={c.name} onChange={(e) => updateHouseholdChild(c.id, { name: e.target.value })} />
              <input
                type="date"
                style={{ flex: "0 0 150px" }}
                value={c.born || ""}
                onChange={(e) => updateHouseholdChild(c.id, { born: e.target.value || null })}
              />
              <button className="x" onClick={() => removeHouseholdChild(c.id)}>
                ×
              </button>
            </div>
            <input
              placeholder="Notes (optional)"
              value={c.notes}
              onChange={(e) => updateHouseholdChild(c.id, { notes: e.target.value })}
            />
          </div>
        ))}
        {addingHouseholdChild ? (
          <div style={{ marginTop: 8 }}>
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
              <input
                placeholder="Notes (optional)"
                value={newHouseholdChild.notes}
                onChange={(e) => setNewHouseholdChild({ ...newHouseholdChild, notes: e.target.value })}
              />
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addHouseholdChild}>
                Add
              </button>
              <button className="x" onClick={() => setAddingHouseholdChild(false)}>
                ×
              </button>
            </div>
          </div>
        ) : (
          <button className="chip add" onClick={() => setAddingHouseholdChild(true)}>
            + child
          </button>
        )}
      </div>

      <div className="card">
        <h3>People who come and visit regularly</h3>
        <p className="hint">Respite/daycare children and other adults connected to the household who don&apos;t live here.</p>
        <b style={{ display: "block", marginTop: 8 }}>Children</b>
        {children.filter((c) => livesHereOf(c) === false).length === 0 && (
          <p className="empty">
            None marked as visiting yet — set a child&apos;s living arrangement to &quot;Visits&quot; in their own
            section below.
          </p>
        )}
        {children
          .filter((c) => livesHereOf(c) === false)
          .map((c) => (
            <div className="rec" key={c.id}>
              {c.name}
              {c.category && <small className="muted"> — {categoryLabel(c.category)}</small>}
            </div>
          ))}

        <b style={{ display: "block", marginTop: 14 }}>Adults</b>
        {visitors.map((v) => (
          <div className="item" key={v.id}>
            <div className="row">
              <input value={v.name} onChange={(e) => updateVisitor(v.id, { name: e.target.value })} />
              <select value={v.role} onChange={(e) => updateVisitor(v.id, { role: e.target.value })}>
                {VISITOR_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button className="x" onClick={() => removeVisitor(v.id)}>
                ×
              </button>
            </div>
            <div className="row">
              <input placeholder="Phone" value={v.phone} onChange={(e) => updateVisitor(v.id, { phone: e.target.value })} />
              <input placeholder="Email" value={v.email} onChange={(e) => updateVisitor(v.id, { email: e.target.value })} />
            </div>
          </div>
        ))}
        {addingVisitor ? (
          <div style={{ marginTop: 8 }}>
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
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addVisitor}>
                Add
              </button>
              <button className="x" onClick={() => setAddingVisitor(false)}>
                ×
              </button>
            </div>
          </div>
        ) : (
          <button className="chip add" onClick={() => setAddingVisitor(true)}>
            + adult
          </button>
        )}
      </div>

      <div className="card">
        <h3>Your supervising social worker</h3>
        <div className="row">
          <input
            placeholder="SSW name"
            value={household.ssw_name}
            onChange={(e) => saveHousehold({ ssw_name: e.target.value })}
          />
          <input
            placeholder="SSW phone"
            value={household.ssw_phone}
            onChange={(e) => saveHousehold({ ssw_phone: e.target.value })}
          />
        </div>
        <input
          placeholder="SSW email"
          value={household.ssw_email}
          onChange={(e) => saveHousehold({ ssw_email: e.target.value })}
        />
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
      </div>

      {children.length === 0 && (
        <div className="card">
          <p className="empty">No children added yet — add one from the Capture tab.</p>
        </div>
      )}

      {children.map((c) => {
        const open = openChild === c.id;
        const cb = basics[c.id] || {};
        return (
          <div className="card" key={c.id}>
            <h3 onClick={() => setOpenChild(open ? null : c.id)} style={{ cursor: "pointer" }}>
              {open ? "▾" : "▸"} {c.name}
            </h3>
            {!open && (
              <div className="muted">
                {livesHereOf(c) === false
                  ? "Visits us"
                  : (LIVES_CATS.find(([k]) => k === c.category)?.[1] ?? (livesHereOf(c) === true ? "Lives with us" : "Not set yet"))}
                {c.mockingbird ? " · " + (MB_OPTIONS.find(([k]) => k === c.mockingbird)?.[1] ?? c.mockingbird) : ""}
              </div>
            )}
            {open && (
              <div style={{ marginBottom: 12 }}>
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
                    <option value="">— category —</option>
                    {LIVES_CATS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                {["sgo", "adopted"].includes(c.category) && (
                  <>
                    <p className="hint" style={{ marginTop: 8 }}>
                      Important contact at Surrey
                    </p>
                    <textarea
                      placeholder="Name · phone · email"
                      defaultValue={c.surrey_contact}
                      onBlur={(e) => saveChild(c.id, { surrey_contact: e.target.value })}
                    />
                  </>
                )}
                <p className="hint" style={{ marginTop: 8 }}>
                  Mockingbird
                </p>
                <select value={c.mockingbird} onChange={(e) => saveChild(c.id, { mockingbird: e.target.value })}>
                  <option value="">— not set —</option>
                  {MB_OPTIONS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {["mb5", "another"].includes(c.mockingbird) && (
                  <>
                    <p className="hint" style={{ marginTop: 6 }}>
                      Hub carer name
                    </p>
                    <input defaultValue={c.hub_carer_name} onBlur={(e) => saveChild(c.id, { hub_carer_name: e.target.value })} />
                    <p className="hint" style={{ marginTop: 6 }}>
                      Hub carer phone
                    </p>
                    <input type="tel" defaultValue={c.hub_carer_phone} onBlur={(e) => saveChild(c.id, { hub_carer_phone: e.target.value })} />
                    <p className="hint" style={{ marginTop: 6 }}>
                      Hub carer email
                    </p>
                    <input type="email" defaultValue={c.hub_carer_email} onBlur={(e) => saveChild(c.id, { hub_carer_email: e.target.value })} />
                  </>
                )}
              </div>
            )}
            {open &&
              BASICS_SECTIONS.map((section) => (
                <div key={section.title} style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: 14 }}>{section.title}</b>
                  {section.fields.map((f) =>
                    f.select ? (
                      <select
                        key={f.key}
                        style={{ marginTop: 6 }}
                        value={cb[f.key] || ""}
                        onChange={(e) => saveChildBasics(c.id, f.key, e.target.value)}
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
                        style={{ marginTop: 6 }}
                        placeholder={f.placeholder ? `${f.label} — ${f.placeholder}` : f.label}
                        defaultValue={cb[f.key] || ""}
                        onBlur={(e) => saveChildBasics(c.id, f.key, e.target.value)}
                      />
                    ),
                  )}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
