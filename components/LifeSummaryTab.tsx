"use client";

import { useState } from "react";
import { today } from "@/lib/domain";
import { Child } from "@/lib/types";

type ChildOption = Pick<Child, "id" | "name" | "lives_here">;

type Period = { dateFrom: string; dateTo: string };
type Length = "brief" | "full";

type Result = { summary: string; noteCount: number; documentCount: number } | { error: string } | null;

function defaultFrom(): string {
  return new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
}

function fmtRange(p: Period): string {
  const f = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${f(p.dateFrom)} – ${f(p.dateTo)}`;
}

// A sentinel id, never a real child id -- picks the "whole household"
// option out of the same single-select chip row as individual children,
// rather than needing a separate toggle next to it.
const HOUSEHOLD_ID = "__household__";

export default function LifeSummaryTab({ childList }: { childList: ChildOption[] }) {
  const [childId, setChildId] = useState(childList[0]?.id || "");
  const [length, setLength] = useState<Length>("full");
  const [period, setPeriod] = useState<Period>({ dateFrom: defaultFrom(), dateTo: today() });
  const [compareOn, setCompareOn] = useState(false);
  const [comparePeriod, setComparePeriod] = useState<Period>({ dateFrom: defaultFrom(), dateTo: today() });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [compareResult, setCompareResult] = useState<Result>(null);

  const householdOptions = childList.filter((c) => c.lives_here !== false);
  const visitingOptions = childList.filter((c) => c.lives_here === false);
  const isHousehold = childId === HOUSEHOLD_ID;
  const selectedChild = childList.find((c) => c.id === childId);
  const scopeLabel = isHousehold ? "Whole household" : selectedChild?.name;

  async function runOne(p: Period): Promise<Result> {
    const res = await fetch("/api/life-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isHousehold
          ? { household: true, dateFrom: p.dateFrom, dateTo: p.dateTo, length }
          : { childId, childName: selectedChild?.name || "", dateFrom: p.dateFrom, dateTo: p.dateTo, length },
      ),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { error: data.error || "Couldn't generate that summary" };
    return data as Result;
  }

  async function generate() {
    if ((!isHousehold && !selectedChild) || busy) return;
    setBusy(true);
    setResult(null);
    setCompareResult(null);
    const [r1, r2] = await Promise.all([runOne(period), compareOn ? runOne(comparePeriod) : Promise.resolve(null)]);
    setResult(r1);
    setCompareResult(r2);
    setBusy(false);
  }

  function renderResult(label: string, r: Result) {
    if (!r) return null;
    if ("error" in r) {
      return (
        <div className="card">
          <h3>{label}</h3>
          <p style={{ color: "var(--danger)" }}>{r.error}</p>
        </div>
      );
    }
    return (
      <div className="card">
        <h3>{label}</h3>
        {r.summary ? (
          <>
            <p style={{ whiteSpace: "pre-wrap" }}>{r.summary}</p>
            <p className="muted" style={{ marginTop: 8 }}>
              Based on {r.noteCount} entr{r.noteCount === 1 ? "y" : "ies"}
              {r.documentCount > 0 ? ` and ${r.documentCount} document${r.documentCount === 1 ? "" : "s"}` : ""}.
            </p>
          </>
        ) : (
          <p className="empty">Nothing logged for this period — nothing to summarise.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h3>How&apos;s life</h3>
        <p className="hint">
          A written summary of how a child&apos;s been doing, drawn from their logged entries and any documents on
          file — handy for remembering what things were like at a particular time, or comparing one period to
          another.
        </p>

        {childList.length === 0 ? (
          <p className="empty">No children added yet.</p>
        ) : (
          <>
            <b style={{ display: "block", fontSize: 13, marginTop: 10 }}>Who</b>
            <div className="chips" style={{ marginTop: 4 }}>
              <button className={`chip${isHousehold ? " on" : ""}`} onClick={() => setChildId(HOUSEHOLD_ID)}>
                🏠 Whole household
              </button>
              {householdOptions.length > 0 && visitingOptions.length > 0 && (
                <small className="muted" style={{ flexBasis: "100%" }}>
                  Household
                </small>
              )}
              {householdOptions.map((c) => (
                <button key={c.id} className={`chip${childId === c.id ? " on" : ""}`} onClick={() => setChildId(c.id)}>
                  {c.name}
                </button>
              ))}
              {visitingOptions.length > 0 && (
                <>
                  <small className="muted" style={{ flexBasis: "100%", marginTop: householdOptions.length ? 4 : 0 }}>
                    Visiting
                  </small>
                  {visitingOptions.map((c) => (
                    <button key={c.id} className={`chip${childId === c.id ? " on" : ""}`} onClick={() => setChildId(c.id)}>
                      {c.name}
                    </button>
                  ))}
                </>
              )}
            </div>

            <b style={{ display: "block", fontSize: 13, marginTop: 14 }}>Length</b>
            <div className="chips" style={{ marginTop: 4 }}>
              <button className={`chip${length === "brief" ? " on" : ""}`} onClick={() => setLength("brief")}>
                Brief
              </button>
              <button className={`chip${length === "full" ? " on" : ""}`} onClick={() => setLength("full")}>
                Full
              </button>
            </div>

            <b style={{ display: "block", fontSize: 13, marginTop: 14 }}>When</b>
            <div className="row" style={{ marginTop: 4 }}>
              <input type="date" value={period.dateFrom} onChange={(e) => setPeriod({ ...period, dateFrom: e.target.value })} />
              <span className="muted" style={{ alignSelf: "center" }}>
                to
              </span>
              <input type="date" value={period.dateTo} onChange={(e) => setPeriod({ ...period, dateTo: e.target.value })} />
            </div>

            <label className="hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} />
              Compare to another period (e.g. the same month last year)
            </label>
            {compareOn && (
              <div className="row" style={{ marginTop: 4 }}>
                <input
                  type="date"
                  value={comparePeriod.dateFrom}
                  onChange={(e) => setComparePeriod({ ...comparePeriod, dateFrom: e.target.value })}
                />
                <span className="muted" style={{ alignSelf: "center" }}>
                  to
                </span>
                <input
                  type="date"
                  value={comparePeriod.dateTo}
                  onChange={(e) => setComparePeriod({ ...comparePeriod, dateTo: e.target.value })}
                />
              </div>
            )}

            <button className="btn" style={{ marginTop: 12 }} onClick={generate} disabled={busy || (!isHousehold && !selectedChild)}>
              {busy ? "Looking back…" : "Generate summary"}
            </button>
            <p className="note" style={{ marginTop: 8 }}>
              Written by AI from what you&apos;ve actually logged — it may notice a repeated pattern worth a second
              look, but it&apos;s never a diagnosis. Always use your own judgement, and raise anything concerning
              with {isHousehold ? "a child's" : "the child's"} social worker.
            </p>
          </>
        )}
      </div>

      {renderResult(scopeLabel ? `${scopeLabel} — ${fmtRange(period)}` : "", result)}
      {compareOn && renderResult(scopeLabel ? `${scopeLabel} — ${fmtRange(comparePeriod)}` : "", compareResult)}
    </div>
  );
}
