"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { describeExpense, describeMeds, expenseTotals, gbp, today } from "@/lib/domain";
import { BUCKETS, Bucket, Child, EntryRecord, Rates } from "@/lib/types";
import DiaryTab from "@/components/DiaryTab";

type Tab = "month" | "expenses" | "meds" | "diary" | "handover";

export default function PaperworkScreen() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("month");
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [handover, setHandover] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [claimedOpen, setClaimedOpen] = useState(false);

  function patchRecord(id: string, patch: Partial<EntryRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function setClaimed(id: string, claimed: boolean) {
    const patch = { claimed, claimed_at: claimed ? new Date().toISOString() : null };
    patchRecord(id, patch);
    await supabase.from("records").update(patch).eq("id", id);
  }

  async function setPaid(id: string, paid: boolean) {
    const patch = { paid, paid_at: paid ? new Date().toISOString() : null };
    patchRecord(id, patch);
    await supabase.from("records").update(patch).eq("id", id);
  }

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
        {(["month", "expenses", "meds", "diary", "handover"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "month" ? "Month" : t === "expenses" ? "Expenses" : t === "meds" ? "Medication" : t === "diary" ? "Diary for SW" : "Handover"}
          </button>
        ))}
      </div>

      {tab === "diary" && <DiaryTab />}

      {tab === "month" && rates && <MonthReport records={monthRecs} kids={children} rates={rates} thisMonth={thisMonth} />}

      {tab === "expenses" && rates && (
        <div className="card">
          <h3>Expenses — {thisMonth}</h3>
          {(() => {
            const all = monthRecs.filter((r) => r.bucket === "expenses");
            const unclaimed = all.filter((r) => !r.claimed);
            const claimed = all.filter((r) => r.claimed);
            return (
              <>
                {unclaimed.length === 0 && <p className="empty">Nothing unclaimed this month.</p>}
                {unclaimed.map((r) => (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
                    <span style={{ flex: 1 }}>{describeExpense(rates, children, r)}</span>
                    <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => setClaimed(r.id, true)}>
                      ✓ Claimed
                    </button>
                  </label>
                ))}
                <div className="total" style={{ marginTop: 10 }}>
                  {gbp(expenseTotals(rates, children, unclaimed).total)} unclaimed
                </div>
                {claimed.length > 0 && (
                  <>
                    <p
                      className="hint"
                      style={{ marginTop: 14, cursor: "pointer" }}
                      onClick={() => setClaimedOpen(!claimedOpen)}
                    >
                      {claimedOpen ? "▾" : "▸"} {claimed.length} already claimed — tap to {claimedOpen ? "hide" : "show"}
                    </p>
                    {claimedOpen &&
                      claimed.map((r) => (
                        <div key={r.id} className="rec" style={{ opacity: 0.85, display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span>
                            {describeExpense(rates, children, r)}
                            {r.paid ? " · Paid" : ""}
                          </span>
                          <span style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
                            {r.paid ? (
                              <button className="chip" onClick={() => setPaid(r.id, false)}>
                                Undo paid
                              </button>
                            ) : (
                              <button className="chip" onClick={() => setPaid(r.id, true)}>
                                ✓ Paid
                              </button>
                            )}{" "}
                            <button className="chip" onClick={() => setClaimed(r.id, false)}>
                              Unclaim
                            </button>
                          </span>
                        </div>
                      ))}
                  </>
                )}
                <p className="note" style={{ marginTop: 10 }}>
                  Tick &quot;Claimed&quot; once you&apos;ve submitted an item — it moves out of the way above. Tick
                  &quot;Paid&quot; once the money&apos;s actually landed. Nothing is deleted.
                </p>
              </>
            );
          })()}
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

function MonthReport({
  records,
  kids,
  rates,
  thisMonth,
}: {
  records: EntryRecord[];
  kids: Child[];
  rates: Rates;
  thisMonth: string;
}) {
  const [copyMsg, setCopyMsg] = useState("");
  const monthLabel = new Date(thisMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const text = (() => {
    let out = `Everyone — ${monthLabel}\n`;
    (Object.keys(BUCKETS) as Bucket[]).forEach((k) => {
      const rs = records.filter((r) => r.bucket === k || r.also_in.includes(k)).sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (!rs.length) return;
      out += `\n${BUCKETS[k].toUpperCase()}\n`;
      if (k === "expenses") {
        rs.forEach((r) => (out += `  ${r.date}: ${describeExpense(rates, kids, r)}\n`));
        out += `Total: ${gbp(expenseTotals(rates, kids, rs).total)}\n`;
      } else {
        rs.forEach((r) => (out += `  ${r.date}${r.child ? ` (${r.child})` : ""}: ${r.bucket === "meds" ? describeMeds(r) : r.text}${r.done ? " ✓" : ""}\n`));
      }
    });
    return out;
  })();

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => setCopyMsg("Copied"),
      () => setCopyMsg("Couldn't copy"),
    );
    setTimeout(() => setCopyMsg(""), 2000);
  }

  return (
    <div className="card">
      <h3>Compile a month</h3>
      <p>
        {records.length} entries recorded in {monthLabel}.
      </p>
      <p className="total">{gbp(expenseTotals(rates, kids, records).total)} in expenses this month</p>
      {records.length ? (
        <>
          <pre id="rep">{text}</pre>
          <button className="btn" onClick={copy}>
            Copy report
          </button>
          {copyMsg && <span className="hint"> {copyMsg}</span>}
        </>
      ) : (
        <p className="empty">Nothing recorded this month.</p>
      )}
      <p className="note">Raw material for your Mockingbird return, expense claim, or a social worker update — read it through before it goes anywhere.</p>
    </div>
  );
}
