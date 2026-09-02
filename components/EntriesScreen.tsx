"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daycareAmount, describeExpense, describeMeds, expenseTotals, gbp, today } from "@/lib/domain";
import { BUCKETS, Bucket, Child, DAYCARE_REASONS, EntryRecord, FLAGS, Rates } from "@/lib/types";
import ComposeEmail from "@/components/ComposeEmail";
import PhotoField from "@/components/PhotoField";

const ERANGES: [string, string][] = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["all", "All time"],
];

function inRange(date: string, range: string): boolean {
  if (range === "all") return true;
  if (range === "month") return date.slice(0, 7) === today().slice(0, 7);
  const days = range === "7d" ? 6 : 29;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date >= cutoff;
}

function fmt(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function EntriesScreen() {
  const supabase = createClient();
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [tab, setTab] = useState<"all" | Bucket>("all");
  const [erange, setErange] = useState("7d");
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: recs }, { data: kids }, { data: r }] = await Promise.all([
      supabase.from("records").select("*").order("created_at", { ascending: false }),
      supabase.from("children").select("id, name, born, family"),
      supabase.from("shared_rates").select("*").single(),
    ]);
    setRecords((recs as EntryRecord[]) ?? []);
    setChildren((kids as Child[]) ?? []);
    setRates(r as Rates);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inRangeRecs = useMemo(() => records.filter((r) => inRange(r.date, erange)), [records, erange]);
  const shown = useMemo(
    () =>
      tab === "all"
        ? inRangeRecs
        : inRangeRecs.filter((r) => r.bucket === tab || (r.also_in || []).includes(tab)),
    [inRangeRecs, tab],
  );

  async function del(id: string) {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("records").delete().eq("id", id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveEdit(r: EntryRecord) {
    const { id, ...patch } = r;
    await supabase
      .from("records")
      .update({ ...patch, edited: new Date().toISOString() })
      .eq("id", id);
    setEditId(null);
    load();
  }

  if (loading) return <p className="muted">Loading…</p>;

  const monthTotals =
    rates && tab === "expenses"
      ? expenseTotals(
          rates,
          children,
          shown.filter((r) => r.date.startsWith(today().slice(0, 7))),
        )
      : null;

  if (composing) {
    return (
      <div>
        <ComposeEmail onClose={() => setComposing(false)} />
      </div>
    );
  }

  return (
    <div>
      <button className="chip" style={{ marginBottom: 10 }} onClick={() => setComposing(true)}>
        ✉️ Compose email
      </button>
      <select style={{ marginBottom: 10 }} value={erange} onChange={(e) => setErange(e.target.value)}>
        {ERANGES.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select style={{ marginBottom: 10 }} value={tab} onChange={(e) => setTab(e.target.value as "all" | Bucket)}>
        <option value="all">All ({inRangeRecs.length})</option>
        {Object.entries(BUCKETS).map(([k, l]) => (
          <option key={k} value={k}>
            {l} ({inRangeRecs.filter((r) => r.bucket === k || (r.also_in || []).includes(k)).length})
          </option>
        ))}
      </select>
      <div className="card">
        {tab === "incident" && (
          <p className="note">
            Incidents usually need a formal notification within 24 hours. This is your record of dates, times and exact
            words — it doesn&apos;t replace the form.
          </p>
        )}
        {shown.length === 0 && <p className="empty">Nothing here yet.</p>}
        {shown.map((r) => (
          <div className={`rec${r.done ? " done" : ""}${tab === "incident" ? " incident" : ""}`} key={r.id}>
            <button className="del" onClick={() => del(r.id)}>
              ×
            </button>
            {editId === r.id ? (
              <EditForm record={r} onCancel={() => setEditId(null)} onSave={saveEdit} rates={rates} children_={children} />
            ) : (
              <span onClick={() => setEditId(r.id)} style={{ cursor: "pointer" }}>
                {r.bucket === "expenses" && rates
                  ? describeExpense(rates, children, r)
                  : r.bucket === "meds"
                    ? describeMeds(r)
                    : r.text}
              </span>
            )}
            <br />
            <small>
              {fmt(r.date)}
              {r.child ? " · " + r.child : ""}
              {tab === "all" ? " · " + BUCKETS[r.bucket] : r.bucket !== tab ? " · filed under " + BUCKETS[r.bucket] : ""}
              {r.shared_with_admin ? " · 📤 shared with admin" : ""}
            </small>
          </div>
        ))}
        {tab === "expenses" && monthTotals && (
          <>
            <div className="sub">
              Purchases {gbp(monthTotals.purchase)} · Mileage {gbp(monthTotals.mileage)} · Day care{" "}
              {gbp(monthTotals.daycare)}
            </div>
            <div className="total">{gbp(monthTotals.total)} this month</div>
          </>
        )}
      </div>
    </div>
  );
}

function EditForm({
  record,
  onSave,
  onCancel,
  rates,
  children_,
}: {
  record: EntryRecord;
  onSave: (r: EntryRecord) => void;
  onCancel: () => void;
  rates: Rates | null;
  children_: Child[];
}) {
  const [draft, setDraft] = useState(record);
  const names = children_.map((c) => c.name);

  function toggleKid(n: string) {
    const kids = draft.kids.includes(n) ? draft.kids.filter((k) => k !== n) : [...draft.kids, n];
    setDraft({ ...draft, kids, child: kids[0] || "" });
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
      <div className="row">
        <select value={draft.bucket} onChange={(e) => setDraft({ ...draft, bucket: e.target.value as Bucket })}>
          {Object.entries(BUCKETS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
      </div>

      {draft.bucket !== "expenses" && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {names.map((n) => (
            <button key={n} className={`chip${draft.kids.includes(n) ? " on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => toggleKid(n)}>
              {n}
            </button>
          ))}
        </div>
      )}

      {draft.bucket === "expenses" && (
        <>
          <div className="row">
            <select value={draft.kind ?? "purchase"} onChange={(e) => setDraft({ ...draft, kind: e.target.value as EntryRecord["kind"] })}>
              <option value="purchase">Purchase</option>
              <option value="mileage">Mileage</option>
              <option value="daycare">Day care</option>
            </select>
          </div>
          {draft.kind === "mileage" && (
            <input
              type="number"
              inputMode="decimal"
              placeholder="miles"
              value={draft.miles ?? ""}
              onChange={(e) => setDraft({ ...draft, miles: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
          {draft.kind === "daycare" && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {names.map((n) => (
                  <button key={n} className={`chip${draft.kids.includes(n) ? " on" : ""}`} style={{ flex: "0 0 auto" }} onClick={() => toggleKid(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="row">
                <input type="time" value={draft.time_from ?? ""} onChange={(e) => setDraft({ ...draft, time_from: e.target.value || null })} />
                <input type="time" value={draft.time_to ?? ""} onChange={(e) => setDraft({ ...draft, time_to: e.target.value || null })} />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  placeholder="or hrs"
                  style={{ flex: "0 0 70px" }}
                  value={draft.hours ?? ""}
                  onChange={(e) => setDraft({ ...draft, hours: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={!!draft.overnight}
                    onChange={(e) => setDraft({ ...draft, overnight: e.target.checked })}
                  />
                  overnight
                </label>
              </div>
              <select value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}>
                <option value="">Reason for day care…</option>
                {DAYCARE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {rates && <div className="calc">{gbp(daycareAmount(rates, children_, draft))}</div>}
            </>
          )}
          {draft.kind === "purchase" && (
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="£"
              value={draft.amount ?? ""}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
        </>
      )}

      {draft.bucket === "meds" && (
        <>
          <div className="row">
            <input placeholder="Medicine" value={draft.med_name} onChange={(e) => setDraft({ ...draft, med_name: e.target.value })} />
            <input placeholder="Dose" value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} />
          </div>
          <div className="row">
            <input type="time" value={draft.given ?? ""} onChange={(e) => setDraft({ ...draft, given: e.target.value || null })} />
            <input placeholder="Given by" value={draft.given_by} onChange={(e) => setDraft({ ...draft, given_by: e.target.value })} />
          </div>
        </>
      )}

      <textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <PhotoField photos={draft.photos ?? []} onChange={(next) => setDraft({ ...draft, photos: next })} />

      <div className="row" style={{ alignItems: "center", marginTop: 4 }}>
        <span className="muted" style={{ flex: "0 0 auto" }}>
          ⚠ Follow-up
        </span>
        <select style={{ flex: 1 }} value={draft.flag} onChange={(e) => setDraft({ ...draft, flag: e.target.value, flag_note: "" })}>
          <option value="">None</option>
          {Object.entries(FLAGS).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {draft.flag && (
        <div className="note">
          {["reminder", "training"].includes(draft.flag) ? (
            <textarea
              placeholder={draft.flag === "training" ? "Suggested course — edit if needed" : "What to remind you to do"}
              value={draft.flag_note}
              onChange={(e) => setDraft({ ...draft, flag_note: e.target.value })}
            />
          ) : (
            FLAGS[draft.flag as keyof typeof FLAGS]?.guidance
          )}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0" }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={!!draft.shared_with_admin}
          onChange={(e) => setDraft({ ...draft, shared_with_admin: e.target.checked })}
        />
        📤 Shared with admin
      </label>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => onSave(draft)}>
          Save
        </button>
        <button className="btn quiet" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
