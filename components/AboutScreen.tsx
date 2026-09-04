"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BASICS_SECTIONS } from "@/lib/basics";
import { Child } from "@/lib/types";

const ADULT_ROLES = ["Foster carer", "Adult child", "Live-in grandparent", "Other"];

type Adult = { id: string; name: string; phone: string; email: string; role: string };

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
  const [openChild, setOpenChild] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState("");

  async function load() {
    const [{ data: kids }, { data: hh }, { data: adultRows }] = await Promise.all([
      supabase.from("children").select("id, name, born, family, basics").order("created_at"),
      supabase.from("household").select("*").maybeSingle(),
      supabase.from("household_adults").select("*").order("created_at"),
    ]);
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
