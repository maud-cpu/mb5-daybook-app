"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { describeExpense, describeMeds, expenseTotals, gbp, today } from "@/lib/domain";
import { BUCKETS, Bucket, Child, EntryRecord, Rates } from "@/lib/types";

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

  return (
    <div>
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
}: {
  record: EntryRecord;
  onSave: (r: EntryRecord) => void;
  onCancel: () => void;
  rates: Rates | null;
  children_: Child[];
}) {
  const [draft, setDraft] = useState(record);
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
      <textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
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
