"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daycareAmount, gbp, today } from "@/lib/domain";
import ThingsToDoCard from "@/components/ThingsToDoCard";
import PhotoField from "@/components/PhotoField";
import ComposeEmail from "@/components/ComposeEmail";
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 26 }, (_, i) => String(CURRENT_YEAR - i));

export default function CaptureScreen() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [warning, setWarning] = useState("");
  const [toast, setToast] = useState("");
  const [addFor, setAddFor] = useState<number | "top" | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildBornMonth, setNewChildBornMonth] = useState("");
  const [newChildBornYear, setNewChildBornYear] = useState("");
  const [newChildFamily, setNewChildFamily] = useState("");
  const [adminName, setAdminName] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeQueue, setComposeQueue] = useState<{ child: string; entryId: string }[]>([]);
  const [courseUrls, setCourseUrls] = useState<Record<string, string>>({});

  async function loadChildren() {
    const { data } = await supabase
      .from("children")
      .select("id, name, born, family, hub_carer_name, hub_carer_email")
      .order("created_at");
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
    Promise.all([
      supabase.from("shared_training_catalog").select("title, platform"),
      supabase.from("shared_training_platforms").select("name, url"),
    ]).then(([{ data: courses }, { data: platforms }]) => {
      const urlByPlatform: Record<string, string> = {};
      (platforms ?? []).forEach((p: { name: string; url: string }) => (urlByPlatform[p.name] = p.url));
      const byCourse: Record<string, string> = {};
      (courses ?? []).forEach((c: { title: string; platform: string }) => {
        const url = urlByPlatform[c.platform];
        if (url) byCourse[c.title] = url;
      });
      setCourseUrls(byCourse);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  function openAddChild(forItem: number | "top", prefillName = "") {
    setAddFor(forItem);
    setNewChildName(prefillName);
    setNewChildBornMonth("");
    setNewChildBornYear("");
    setNewChildFamily("");
  }

  async function addChild() {
    const name = newChildName.trim();
    if (!name) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showToast("Couldn't add child: not signed in");
      return;
    }
    const born = newChildBornMonth && newChildBornYear ? `${newChildBornYear}-${newChildBornMonth}-01` : null;
    const { data, error } = await supabase
      .from("children")
      .insert({ user_id: user.id, name, born, family: newChildFamily.trim() })
      .select("id, name, born, family")
      .single();
    if (error) {
      showToast("Couldn't add child: " + error.message);
      return;
    }
    await loadChildren();
    if (typeof addFor === "number" && data) {
      const addedName = (data as Child).name;
      setPending((prev) =>
        prev.map((p, idx) => {
          if (idx !== addFor) return p;
          const kids = p.kids.includes(addedName) ? p.kids : [...p.kids, addedName];
          const unmatched = (p.unmatched ?? []).filter((n) => n.toLowerCase() !== name.toLowerCase());
          return { ...p, kids, unmatched, child: p.child || addedName };
        }),
      );
    }
    setNewChildName("");
    setNewChildBornMonth("");
    setNewChildBornYear("");
    setNewChildFamily("");
    setAddFor(null);
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

  function toggleSendHub(i: number, name: string) {
    setPending((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const send_hub = (p.send_hub ?? []).includes(name)
          ? (p.send_hub ?? []).filter((k) => k !== name)
          : [...(p.send_hub ?? []), name];
        return { ...p, send_hub };
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
      photos: p.photos ?? [],
    }));
    const { data: inserted, error } = await supabase.from("records").insert(rows).select("id");
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    showToast(`Saved ${rows.length} item${rows.length > 1 ? "s" : ""}`);
    const queue: { child: string; entryId: string }[] = [];
    pending.forEach((p, idx) => {
      const entryId = inserted?.[idx]?.id;
      if (!entryId) return;
      (p.send_hub ?? []).forEach((child) => queue.push({ child, entryId }));
    });
    setPending([]);
    setCap("");
    if (queue.length) {
      setComposeQueue(queue);
      setComposing(true);
    }
  }

  function closeCompose() {
    const rest = composeQueue.slice(1);
    if (rest.length) {
      setComposeQueue(rest);
    } else {
      setComposing(false);
      setComposeQueue([]);
    }
  }

  const names = children.map((c) => c.name);

  function addChildForm() {
    return (
      <div style={{ marginTop: 8 }}>
        <input
          placeholder="Initials or first name"
          value={newChildName}
          onChange={(e) => setNewChildName(e.target.value)}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <span className="muted" style={{ alignSelf: "center", flex: "0 0 auto" }}>
            Born
          </span>
          <select value={newChildBornMonth} onChange={(e) => setNewChildBornMonth(e.target.value)}>
            <option value="">Month</option>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>
                {m}
              </option>
            ))}
          </select>
          <select value={newChildBornYear} onChange={(e) => setNewChildBornYear(e.target.value)}>
            <option value="">Year</option>
            {BIRTH_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input
            placeholder="Household / carer (e.g. Smiths)"
            value={newChildFamily}
            onChange={(e) => setNewChildFamily(e.target.value)}
          />
          <button className="chip" style={{ flex: "0 0 auto" }} onClick={addChild}>
            Add
          </button>
        </div>
        <p className="note">Just month and year is enough — we only need this to work out age bands, not their exact birthday.</p>
      </div>
    );
  }

  if (composing && composeQueue[0]) {
    return (
      <div>
        <ComposeEmail onClose={closeCompose} presetChildName={composeQueue[0].child} presetEntryId={composeQueue[0].entryId} />
      </div>
    );
  }

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
          <button className="chip add" onClick={() => (addFor === "top" ? setAddFor(null) : openAddChild("top"))}>
            + child
          </button>
        </p>
        {addFor === "top" && addChildForm()}
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

              {(p.unmatched ?? []).length > 0 && (
                <div className="note" style={{ color: "#a66d00" }}>
                  {p.unmatched!.map((n) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>⚠ &quot;{n}&quot; isn&apos;t registered yet — add them so this links up properly.</span>
                      <button
                        className="chip"
                        style={{ flex: "0 0 auto" }}
                        onClick={() => (addFor === i ? setAddFor(null) : openAddChild(i, n))}
                      >
                        + Register {n}
                      </button>
                    </div>
                  ))}
                  {addFor === i && addChildForm()}
                </div>
              )}

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
                  {rates && (
                    <div className="calc">
                      {gbp(daycareAmount(rates, children, p as never))}
                      {!p.overnight && !p.time_from && !p.time_to && !p.hours && (
                        <span className="note" style={{ color: "#a66d00", display: "block", fontWeight: "normal" }}>
                          ⚠ No hours or times given yet, so this is £0.00 — add them above.
                        </span>
                      )}
                    </div>
                  )}
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

              <PhotoField photos={p.photos ?? []} onChange={(next) => updatePending(i, { photos: next })} />

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
              {p.training_note && (
                <div className="note">
                  💡 {p.training_note}
                  {p.training_course && courseUrls[p.training_course] && (
                    <>
                      {" "}
                      <a href={courseUrls[p.training_course]} target="_blank" rel="noopener noreferrer">
                        Open course ↗
                      </a>
                    </>
                  )}
                </div>
              )}
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
              {p.kids
                .map((k) => children.find((c) => c.name === k))
                .filter((c): c is Child => !!c && !!(c.hub_carer_name || c.hub_carer_email))
                .map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={(p.send_hub ?? []).includes(c.name)}
                      onChange={() => toggleSendHub(i, c.name)}
                    />
                    📤 Also send this to {c.name}&apos;s Mockingbird hub carer{c.hub_carer_name ? ` (${c.hub_carer_name})` : ""} — instead of
                    messaging them separately
                  </label>
                ))}
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

      <ThingsToDoCard />

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
