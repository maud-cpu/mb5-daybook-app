"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { describeExpense, describeMeds, expenseTotals, gbp, today } from "@/lib/domain";
import { Child, EntryRecord, Rates } from "@/lib/types";

type Tab = "month" | "expenses" | "meds" | "handover";

export default function PaperworkScreen() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("month");
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [handover, setHandover] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: recs }, { data: kids }, { data: r }, { data: ho }] = await Promise.all([
        supabase.from("records").select("*").order("date", { ascending: false }),
        supabase.from("children").select("id, name, born, family"),
        supabase.from("shared_rates").select("*").single(),
        supabase.from("handovers").select("content").maybeSingle(),
      ]);
      setRecords((recs as EntryRecord[]) ?? []);
      setChildren((kids as Child[]) ?? []);
      setRates(r as Rates);
      setHandover(ho?.content ?? "");
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveHandover(content: string) {
    setHandover(content);
    await supabase.from("handovers").upsert({ content, updated_at: new Date().toISOString() });
    setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setTimeout(() => setSavedAt(""), 1500);
  }

  const thisMonth = today().slice(0, 7);
  const monthRecs = records.filter((r) => r.date.startsWith(thisMonth));

  return (
    <div>
      <div className="tabs">
        {(["month", "expenses", "meds", "handover"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "month" ? "Month" : t === "expenses" ? "Expenses" : t === "meds" ? "Medication" : "Handover"}
          </button>
        ))}
      </div>

      {tab === "month" && rates && (
        <div className="card">
          <h3>This month at a glance</h3>
          <p>{monthRecs.length} entries recorded in {new Date(thisMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}.</p>
          <p className="total">{gbp(expenseTotals(rates, children, monthRecs).total)} in expenses this month</p>
        </div>
      )}

      {tab === "expenses" && rates && (
        <div className="card">
          <h3>Expenses — {thisMonth}</h3>
          {monthRecs.filter((r) => r.bucket === "expenses").length === 0 && <p className="empty">Nothing this month.</p>}
          {monthRecs
            .filter((r) => r.bucket === "expenses")
            .map((r) => (
              <div className="rec" key={r.id}>
                {describeExpense(rates, children, r)}
              </div>
            ))}
          <div className="total" style={{ marginTop: 10 }}>
            {gbp(expenseTotals(rates, children, monthRecs).total)} total
          </div>
        </div>
      )}

      {tab === "meds" && (
        <div className="card">
          <h3>Medication log — {thisMonth}</h3>
          {monthRecs.filter((r) => r.bucket === "meds").length === 0 && <p className="empty">Nothing this month.</p>}
          {monthRecs
            .filter((r) => r.bucket === "meds")
            .map((r) => (
              <div className="rec" key={r.id}>
                {describeMeds(r)} <small className="muted">— {r.date}</small>
              </div>
            ))}
        </div>
      )}

      {tab === "handover" && (
        <div className="card">
          <h3>Handover notes</h3>
          <p className="hint">Free text for whoever needs to step in — private to you, not shared with other carers.</p>
          <textarea rows={10} value={handover} onChange={(e) => saveHandover(e.target.value)} />
          {savedAt && <p className="hint">Saved {savedAt}</p>}
        </div>
      )}
    </div>
  );
}
