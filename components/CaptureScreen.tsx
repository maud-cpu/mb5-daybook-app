"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daycareAmount, gbp, today } from "@/lib/domain";
import {
  BUCKETS,
  Bucket,
  Child,
  DAYCARE_REASONS,
  EXPENSE_KINDS,
  FLAGS,
  PendingItem,
  Rates,
} from "@/lib/types";

export default function CaptureScreen() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [warning, setWarning] = useState("");
  const [toast, setToast] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildBorn, setNewChildBorn] = useState("");
  const [newChildFamily, setNewChildFamily] = useState("");
  const [adminName, setAdminName] = useState("");

  async function loadChildren() {
    const { data } = await supabase.from("children").select("id, name, born, family").order("created_at");
    setChildren((data as Child[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    loadChildren();
    supabase
      .from("shared_rates")
      .select("*")
      .single()
      .then(({ data }) => setRates(data as Rates));
    supabase
      .from("profiles")
      .select("display_name")
      .eq("role", "admin")
      .then(({ data }) => setAdminName((data ?? []).map((a) => a.display_name).join(" & ")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  async function addChild() {
    const name = newChildName.trim();
    if (!name) return;
    await supabase.from("children").insert({ name, born: newChildBorn || null, family: newChildFamily.trim() });
    setNewChildName("");
    setNewChildBorn("");
    setNewChildFamily("");
    setAddingChild(false);
    loadChildren();
  }

  async function sortIt() {
    const text = cap.trim();
    if (!text) return;
    setBusy(true);
    setWarning("");
    try {
      const res = await fetch("/api/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error);
      } else {
        setPending(data.items ?? []);
        if (data.warning) setWarning(data.warning);
      }
    } catch {
      showToast("Couldn't reach the sorting service — try again in a moment.");
    }
    setBusy(false);
  }

  function updatePending(i: number, patch: Partial<PendingItem>) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function toggleKid(i: number, name: string) {
    setPending((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const kids = p.kids.includes(name) ? p.kids.filter((k) => k !== name) : [...p.kids, name];
        return { ...p, kids };
      }),
    );
  }

  async function saveAll() {
    if (!pending.length) return;
    const rows = pending.map((p) => ({
      bucket: p.bucket,
      child: p.kids[0] || "",
      kids: p.kids,
      also_in: p.also_in ?? [],
      text: p.text,
      date: today(),
      kind: p.bucket === "expenses" ? p.kind : null,
      amount: p.amount ?? null,
      miles: p.miles ?? null,
      hours: p.hours ?? null,
      time_from: p.time_from ?? null,
      time_to: p.time_to ?? null,
      overnight: !!p.overnight,
      reason: p.reason ?? "",
      med_name: p.med_name ?? "",
      dose: p.dose ?? "",
      given: p.given ?? null,
      given_by: p.given_by ?? "",
      flag: p.flag ?? "",
      flag_note: p.flag_note ?? "",
      training_note: p.training_note ?? "",
      shared_with_admin: !!p.shared_with_admin,
    }));
    const { error } = await supabase.from("records").insert(rows);
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    showToast(`Saved ${rows.length} item${rows.length > 1 ? "s" : ""}`);
    setPending([]);
    setCap("");
  }

  const names = children.map((c) => c.name);

  return (
    <div>
      <div className="card">
        <h3>What happened?</h3>
        <textarea
          placeholder="Type what happened. Say where things go — 'diary', 'supervision', 'expenses', 'social worker', 'incident', 'just record'. Mileage and hours of day care get costed automatically."
          value={cap}
          onChange={(e) => setCap(e.target.value)}
        />
        <button className="btn" disabled={busy || !cap.trim()} onClick={sortIt}>
          {busy ? "Sorting…" : "Sort it"}
        </button>
        <p className="hint">
          Children: {names.join(", ") || "none yet"}{" "}
          <button className="chip add" onClick={() => setAddingChild(!addingChild)}>
            + child
          </button>
        </p>
        {addingChild && (
          <div style={{ marginTop: 8 }}>
            <input
              placeholder="Initials or first name"
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <input
                type="month"
                style={{ flex: "0 0 150px" }}
                title="Month and year of birth"
                value={newChildBorn}
                onChange={(e) => setNewChildBorn(e.target.value)}
              />
              <input
                placeholder="Household / carer (e.g. Smiths)"
                value={newChildFamily}
                onChange={(e) => setNewChildFamily(e.target.value)}
              />
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addChild}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {warning && <div className="note">{warning}</div>}

      {pending.length > 0 && (
        <div className="card">
          <h3>Check before saving</h3>
          {pending.map((p, i) => (
            <div className="item" key={i}>
              <div className="row">
                <select value={p.bucket} onChange={(e) => updatePending(i, { bucket: e.target.value as Bucket })}>
                  {Object.entries(BUCKETS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {p.bucket === "expenses" && (
                  <select value={p.kind ?? "purchase"} onChange={(e) => updatePending(i, { kind: e.target.value as PendingItem["kind"] })}>
                    {EXPENSE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k === "purchase" ? "Purchase" : k === "mileage" ? "Mileage" : "Day care"}
                      </option>
                    ))}
                  </select>
                )}
                <button className="x" onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}>
                  ×
                </button>
              </div>

              {p.bucket !== "expenses" && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {names.map((n) => (
                    <button
                      key={n}
                      className={`chip${p.kids.includes(n) ? " on" : ""}`}
                      style={{ flex: "0 0 auto" }}
                      onClick={() => toggleKid(i, n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {p.bucket === "expenses" && p.kind === "mileage" && (
                <div className="row">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="miles"
                    value={p.miles ?? ""}
                    onChange={(e) => updatePending(i, { miles: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}

              {p.bucket === "expenses" && p.kind === "daycare" && (
                <>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {names.map((n) => (
                      <button
                        key={n}
                        className={`chip${p.kids.includes(n) ? " on" : ""}`}
                        style={{ flex: "0 0 auto" }}
                        onClick={() => toggleKid(i, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <input
                      type="time"
                      value={p.time_from ?? ""}
                      onChange={(e) => updatePending(i, { time_from: e.target.value || null })}
                    />
                    <input
                      type="time"
                      value={p.time_to ?? ""}
                      onChange={(e) => updatePending(i, { time_to: e.target.value || null })}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      placeholder="or hrs"
                      style={{ flex: "0 0 70px" }}
                      value={p.hours ?? ""}
                      onChange={(e) => updatePending(i, { hours: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={!!p.overnight}
                        onChange={(e) => updatePending(i, { overnight: e.target.checked })}
                      />
                      overnight
                    </label>
                  </div>
                  <div className="row">
                    <select value={p.reason || ""} onChange={(e) => updatePending(i, { reason: e.target.value })}>
                      <option value="">Reason for day care…</option>
                      {DAYCARE_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  {rates && <div className="calc">{gbp(daycareAmount(rates, children, p as never))}</div>}
                </>
              )}

              {p.bucket === "expenses" && p.kind === "purchase" && (
                <div className="row">
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="£"
                    value={p.amount ?? ""}
                    onChange={(e) => updatePending(i, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}

              {p.bucket === "meds" && (
                <>
                  <div className="row">
                    <input
                      placeholder="Medicine"
                      value={p.med_name ?? ""}
                      onChange={(e) => updatePending(i, { med_name: e.target.value })}
                    />
                    <input
                      placeholder="Dose (e.g. 5ml, 1 tablet)"
                      value={p.dose ?? ""}
                      onChange={(e) => updatePending(i, { dose: e.target.value })}
                    />
                  </div>
                  <div className="row">
                    <input
                      type="time"
                      value={p.given ?? ""}
                      onChange={(e) => updatePending(i, { given: e.target.value || null })}
                    />
                    <input
                      placeholder="Given by"
                      value={p.given_by ?? ""}
                      onChange={(e) => updatePending(i, { given_by: e.target.value })}
                    />
                  </div>
                </>
              )}

              <textarea value={p.text} onChange={(e) => updatePending(i, { text: e.target.value })} />

              <div className="row" style={{ alignItems: "center", marginTop: 4 }}>
                <span className="muted" style={{ flex: "0 0 auto" }}>
                  ⚠ Follow-up
                </span>
                <select
                  style={{ flex: 1 }}
                  value={p.flag || ""}
                  onChange={(e) => updatePending(i, { flag: e.target.value, flag_note: "" })}
                >
                  <option value="">None</option>
                  {Object.entries(FLAGS).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              {p.flag && (
                <div className="note">
                  {["reminder", "training"].includes(p.flag) ? (
                    <textarea
                      placeholder={p.flag === "training" ? "Suggested course — edit if needed" : "What to remind you to do"}
                      value={p.flag_note ?? ""}
                      onChange={(e) => updatePending(i, { flag_note: e.target.value })}
                    />
                  ) : (
                    FLAGS[p.flag as keyof typeof FLAGS]?.guidance
                  )}
                </div>
              )}
              {p.training_note && <div className="note">💡 {p.training_note}</div>}
              {adminName && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={!!p.shared_with_admin}
                    onChange={(e) => updatePending(i, { shared_with_admin: e.target.checked })}
                  />
                  📤 Also send this one straight to {adminName} — instead of phoning/messaging them separately
                </label>
              )}
            </div>
          ))}
          <button className="btn" onClick={saveAll}>
            Save all
          </button>
          <button className="btn quiet" onClick={() => setPending([])}>
            Discard
          </button>
        </div>
      )}

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
