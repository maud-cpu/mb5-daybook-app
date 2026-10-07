"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { daycareAmount, describeExpense, describeMeds, expenseTotals, gbp, sortChildren, today } from "@/lib/domain";
import { addDays } from "@/lib/calendarHelpers";
import { unreportedIncidentItems } from "@/lib/thingsToDo";
import { BUCKETS, Bucket, Child, DAYCARE_REASONS, EntryRecord, FLAGS, FlagKey, HUB_SUPPORT_TYPES, Rates } from "@/lib/types";
import { BASICS_SECTIONS } from "@/lib/basics";
import DiaryTab from "@/components/DiaryTab";
import HandoverTab from "@/components/HandoverTab";
import HubLogTab from "@/components/HubLogTab";
import AnnualReviewTab from "@/components/AnnualReviewTab";
import FormsReference from "@/components/FormsReference";
import LifeSummaryTab from "@/components/LifeSummaryTab";

type Tab = "month" | "supervision" | "cla" | "life" | "expenses" | "meds" | "diary" | "handover" | "hub" | "annualReview" | "forms";
type ChildWithBasics = Child & { basics: Record<string, string> };
type TrainingCompletion = { title: string; completedOn: string; url: string; length: string; platform: string };
type NewExpenseDraft = {
  date: string;
  kind: "purchase" | "mileage" | "daycare";
  amount: string;
  miles: string;
  kids: string[];
  time_from: string;
  time_to: string;
  hours: string;
  overnight: boolean;
  reason: string;
  text: string;
};

function blankExpenseDraft(): NewExpenseDraft {
  return {
    date: today(),
    kind: "purchase",
    amount: "",
    miles: "",
    kids: [],
    time_from: "",
    time_to: "",
    hours: "",
    overnight: false,
    reason: "",
    text: "",
  };
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtMonthLabel(ym: string): string {
  return new Date(ym + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const TAB_VALUES: Tab[] = ["month", "supervision", "cla", "life", "expenses", "meds", "diary", "handover", "hub", "annualReview", "forms"];

export default function PaperworkScreen() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  // A link in from elsewhere (e.g. About Us's "write up your review" link)
  // should land straight on that tab, not always on "Month".
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>((TAB_VALUES as string[]).includes(tabParam || "") ? (tabParam as Tab) : "month");
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [children, setChildren] = useState<ChildWithBasics[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [claimedOpen, setClaimedOpen] = useState(false);
  const [childFilter, setChildFilter] = useState<string[]>([]);
  const [childFilterOpen, setChildFilterOpen] = useState(false);
  const [childSearch, setChildSearch] = useState("");
  const [trainingDone, setTrainingDone] = useState<TrainingCompletion[]>([]);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newExpense, setNewExpense] = useState<NewExpenseDraft>(blankExpenseDraft());
  const [addExpenseError, setAddExpenseError] = useState("");

  function toggleChildFilter(name: string) {
    setChildFilter((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function patchRecord(id: string, patch: Partial<EntryRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleNewExpenseKid(name: string) {
    setNewExpense((prev) => ({
      ...prev,
      kids: prev.kids.includes(name) ? prev.kids.filter((k) => k !== name) : [...prev.kids, name],
    }));
  }

  // Writes a real records row -- the same table Capture/Entries use -- so an
  // expense added here shows up everywhere else too (the child's own
  // history, Entries, the month total), not just in this one report.
  async function saveNewExpense() {
    setAddExpenseError("");
    const e = newExpense;
    const row = {
      bucket: "expenses" as const,
      date: e.date,
      kind: e.kind,
      text: e.text.trim(),
      kids: e.kind === "daycare" ? e.kids : [],
      child: e.kind === "daycare" ? e.kids[0] || "" : "",
      amount: e.kind === "purchase" ? (e.amount ? Number(e.amount) : null) : null,
      miles: e.kind === "mileage" ? (e.miles ? Number(e.miles) : null) : null,
      time_from: e.kind === "daycare" ? e.time_from || null : null,
      time_to: e.kind === "daycare" ? e.time_to || null : null,
      hours: e.kind === "daycare" ? (e.hours ? Number(e.hours) : null) : null,
      overnight: e.kind === "daycare" ? e.overnight : false,
      reason: e.kind === "daycare" ? e.reason : "",
    };
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [row] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddExpenseError(data.error || "Couldn't save that expense");
      return;
    }
    const { records: recs } = await fetch("/api/records").then((r) => r.json());
    setRecords((recs as EntryRecord[]) ?? []);
    setNewExpense(blankExpenseDraft());
    setAddingExpense(false);
  }

  async function setClaimed(id: string, claimed: boolean) {
    const patch = { claimed, claimed_at: claimed ? new Date().toISOString() : null };
    patchRecord(id, patch);
    await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) });
  }

  async function setPaid(id: string, paid: boolean) {
    const patch = { paid, paid_at: paid ? new Date().toISOString() : null };
    patchRecord(id, patch);
    await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch }) });
  }

  useEffect(() => {
    async function load() {
      const [recordsRes, kidsRes, hhKidsRes, { data: r }, { data: training }, { data: catalog }, householdRes] = await Promise.all([
        fetch("/api/records").then((res) => res.json()),
        fetch("/api/children").then((res) => res.json()),
        // A child in "Children in your household" can be an actual foster
        // placement too, not just the carer's own/adopted/kinship child --
        // include them so month reports and expense filters cover them too.
        fetch("/api/household-children").then((res) => res.json()),
        supabase.from("shared_rates").select("*").single(),
        supabase.from("training_progress").select("course_title, completed_on").not("completed_on", "is", null),
        // training_progress only ever stored the plain course title, no id --
        // matching it back to the catalog by title is the only way to bring
        // the link/length along for a completed course in the supervision
        // report, so it's not just a title someone has to search for again.
        supabase.from("shared_training_catalog").select("title, url, length, platform"),
        fetch("/api/household").then((res) => res.json()),
      ]);
      const kids = kidsRes.children;
      const hhKids = hhKidsRes.children;
      setRecords((recordsRes.records as EntryRecord[]) ?? []);
      setChildren(
        sortChildren([
          ...((kids as ChildWithBasics[]) ?? []).map((c) => ({ ...c, basics: c.basics || {} })),
          ...(((hhKids as (Pick<Child, "id" | "name" | "born" | "category"> & { basics: Record<string, string> })[]) ?? []).map(
            (h) => ({ ...h, family: "", lives_here: true, basics: h.basics || {} }) as ChildWithBasics,
          )),
        ]),
      );
      // skills_payment_weekly is personal to this carer, not part of the
      // shared_rates card -- merged in here so a "Carer respite" day care
      // item prices correctly (see daycareAmount in lib/domain.ts).
      setRates(r ? { ...(r as Rates), skills_payment_weekly: householdRes.household?.skills_payment_weekly ?? 0 } : null);
      const catalogByTitle = new Map(
        ((catalog as { title: string; url: string; length: string; platform: string }[] | null) ?? []).map((c) => [
          c.title.trim().toLowerCase(),
          c,
        ]),
      );
      setTrainingDone(
        ((training as { course_title: string; completed_on: string }[] | null) ?? []).map((t) => {
          const match = catalogByTitle.get(t.course_title.trim().toLowerCase());
          return {
            title: t.course_title,
            completedOn: t.completed_on,
            url: match?.url || "",
            length: match?.length || "",
            platform: match?.platform || "",
          };
        }),
      );
    }
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The child-filter chips used to be one flat list -- fine for a handful of
  // kids, unreadable once the visiting/hub roster grew. Splitting into
  // Household/Visiting groups wasn't enough once either group itself got
  // long, so this is now collapsed behind a toggle (closed by default,
  // showing what's currently selected) with a search box to narrow the
  // chips shown, same pattern as the Visitors directory redesign.
  const childSearchQ = childSearch.trim().toLowerCase();
  const matchesChildSearch = (name: string) => !childSearchQ || name.toLowerCase().includes(childSearchQ);
  const householdFilterChildren = children.filter((c) => c.lives_here !== false && matchesChildSearch(c.name));
  const visitingFilterChildren = children.filter((c) => c.lives_here === false && matchesChildSearch(c.name));

  const thisMonth = today().slice(0, 7);
  const allMonthRecs = records.filter((r) => r.date.startsWith(thisMonth));
  const monthRecs = childFilter.length
    ? allMonthRecs.filter((r) => r.kids.some((k) => childFilter.includes(k)))
    : allMonthRecs;
  // Supervision isn't scoped to the calendar month -- an open follow-up
  // stays relevant across a month boundary until it's actually resolved --
  // so this filters by child only, across every record.
  const supervisionRecs = childFilter.length ? records.filter((r) => r.kids.some((k) => childFilter.includes(k))) : records;
  // CLA reviews only ever concern a child actually placed with you, never a
  // visiting/daycare child who just happens to be in the same "children"
  // table -- lives_here is only ever explicitly false for those.
  const claChildren = children.filter((c) => c.lives_here !== false && (childFilter.length === 0 || childFilter.includes(c.name)));

  return (
    <div>
      <div className="tabs">
        {TAB_VALUES.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "month"
              ? "Month"
              : t === "supervision"
                ? "Supervision"
                : t === "cla"
                  ? "CLA prep"
                  : t === "life"
                    ? "How's life"
                    : t === "expenses"
                      ? "Expenses"
                      : t === "meds"
                        ? "Medication"
                        : t === "diary"
                          ? "Diary for SW"
                          : t === "handover"
                            ? "Handover"
                            : t === "hub"
                              ? "Hub log"
                              : t === "annualReview"
                                ? "Annual review"
                                : "Forms"}
          </button>
        ))}
      </div>

      {["month", "supervision", "cla", "expenses", "meds"].includes(tab) && children.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            className="chip"
            onClick={() => setChildFilterOpen(!childFilterOpen)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {childFilterOpen ? "▾" : "▸"} 👤{" "}
            {childFilter.length === 0 ? "All children" : childFilter.length === 1 ? childFilter[0] : `${childFilter.length} children selected`}
          </button>
          {childFilter.length > 0 && (
            <button className="chip" style={{ marginLeft: 6 }} onClick={() => setChildFilter([])}>
              Clear
            </button>
          )}
          {childFilterOpen && (
            <div style={{ marginTop: 8 }}>
              <input placeholder="Search children…" value={childSearch} onChange={(e) => setChildSearch(e.target.value)} />
              <div className="chips" style={{ marginTop: 6 }}>
                {householdFilterChildren.length > 0 && visitingFilterChildren.length > 0 && (
                  <small className="muted" style={{ flexBasis: "100%" }}>
                    Household
                  </small>
                )}
                {householdFilterChildren.map((c) => (
                  <button
                    key={c.id}
                    className={`chip${childFilter.includes(c.name) ? " on" : ""}`}
                    onClick={() => toggleChildFilter(c.name)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {visitingFilterChildren.length > 0 && (
                <div className="chips" style={{ marginTop: 4 }}>
                  <small className="muted" style={{ flexBasis: "100%" }}>
                    Visiting
                  </small>
                  {visitingFilterChildren.map((c) => (
                    <button
                      key={c.id}
                      className={`chip${childFilter.includes(c.name) ? " on" : ""}`}
                      onClick={() => toggleChildFilter(c.name)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {householdFilterChildren.length === 0 && visitingFilterChildren.length === 0 && (
                <p className="empty" style={{ marginTop: 6 }}>
                  No one matches &quot;{childSearch.trim()}&quot;.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "diary" && <DiaryTab />}

      {tab === "month" && rates && <MonthReport records={monthRecs} kids={children} rates={rates} thisMonth={thisMonth} />}

      {tab === "supervision" && (
        <>
          <SupervisionReport records={supervisionRecs} training={trainingDone} allChildren={children} />
          <MockingbirdSummary />
        </>
      )}

      {tab === "cla" && <ClaPrepReport childList={claChildren} records={records} />}

      {tab === "life" && <LifeSummaryTab childList={children} />}

      {tab === "expenses" && rates && (
        <div className="card">
          <h3>Expenses</h3>
          <p className="note">
            Everything you haven&apos;t ticked &quot;Claimed&quot; yet, however old — nothing drops out of view just
            because it&apos;s been a while since you last claimed.
          </p>

          <p>
            <a href="https://cfportal.surreycc.gov.uk/" target="_blank" rel="noopener noreferrer">
              🔗 Surrey carer portal — claim expenses here
            </a>
          </p>

          <button className="chip add" onClick={() => setAddingExpense(!addingExpense)}>
            {addingExpense ? "Cancel" : "+ Add expense"}
          </button>

          {addingExpense && (
            <div style={{ marginTop: 8, padding: 8, background: "#fbfaf6", borderRadius: "var(--radius-sm)" }}>
              <div className="row">
                <input
                  type="date"
                  style={{ flex: "0 0 150px" }}
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                />
                <select value={newExpense.kind} onChange={(e) => setNewExpense({ ...newExpense, kind: e.target.value as NewExpenseDraft["kind"] })}>
                  <option value="purchase">Purchase</option>
                  <option value="mileage">Mileage</option>
                  <option value="daycare">Day care</option>
                </select>
              </div>

              {newExpense.kind === "purchase" && (
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="£"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                />
              )}

              {newExpense.kind === "mileage" && (
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="miles"
                  value={newExpense.miles}
                  onChange={(e) => setNewExpense({ ...newExpense, miles: e.target.value })}
                />
              )}

              {newExpense.kind === "daycare" && (
                <>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`chip${newExpense.kids.includes(c.name) ? " on" : ""}`}
                        style={{ flex: "0 0 auto" }}
                        onClick={() => toggleNewExpenseKid(c.name)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <input
                      type="time"
                      value={newExpense.time_from}
                      onChange={(e) => setNewExpense({ ...newExpense, time_from: e.target.value })}
                    />
                    <input type="time" value={newExpense.time_to} onChange={(e) => setNewExpense({ ...newExpense, time_to: e.target.value })} />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      placeholder="or hrs"
                      style={{ flex: "0 0 70px" }}
                      value={newExpense.hours}
                      onChange={(e) => setNewExpense({ ...newExpense, hours: e.target.value })}
                    />
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={newExpense.overnight}
                        onChange={(e) => setNewExpense({ ...newExpense, overnight: e.target.checked })}
                      />
                      overnight
                    </label>
                  </div>
                  <select value={newExpense.reason} onChange={(e) => setNewExpense({ ...newExpense, reason: e.target.value })}>
                    <option value="">Reason for day care…</option>
                    {DAYCARE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {rates && (
                    <div className="calc">
                      {gbp(
                        daycareAmount(rates, children, {
                          kids: newExpense.kids,
                          overnight: newExpense.overnight,
                          time_from: newExpense.time_from || null,
                          time_to: newExpense.time_to || null,
                          hours: newExpense.hours ? Number(newExpense.hours) : null,
                          reason: newExpense.reason,
                          nights: null,
                        }),
                      )}
                    </div>
                  )}
                </>
              )}

              <textarea
                rows={2}
                placeholder="What was this for?"
                value={newExpense.text}
                onChange={(e) => setNewExpense({ ...newExpense, text: e.target.value })}
              />
              {addExpenseError && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 4 }}>{addExpenseError}</p>}
              <button className="chip" style={{ marginTop: 6 }} onClick={saveNewExpense}>
                Save
              </button>
            </div>
          )}

          {(() => {
            // Deliberately not scoped to thisMonth (unlike monthRecs, used by
            // the Month/Medication tabs) -- an expense doesn't stop mattering
            // just because it's no longer the current month, and this is the
            // one screen actually used to claim money back. Oldest first so
            // the longest-neglected claims surface at the top, not buried
            // under more recent ones.
            const all = records
              .filter((r) => r.bucket === "expenses" && (!childFilter.length || r.kids.some((k) => childFilter.includes(k))))
              .sort((a, b) => a.date.localeCompare(b.date));
            const unclaimed = all.filter((r) => !r.claimed);
            const claimed = [...all.filter((r) => r.claimed)].reverse();
            return (
              <>
                {unclaimed.length === 0 && <p className="empty">Nothing unclaimed.</p>}
                {unclaimed.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <span style={{ flex: 1 }}>
                      <b>{fmtDate(r.date)}</b> — {describeExpense(rates, children, r)}
                    </span>
                    <Link className="chip" style={{ flex: "0 0 auto" }} href={`/dashboard/entries?edit=${r.id}`}>
                      ✏️ Edit
                    </Link>
                    <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => setClaimed(r.id, true)}>
                      ✓ Claimed
                    </button>
                  </div>
                ))}
                <div className="total" style={{ marginTop: 10 }}>
                  {gbp(expenseTotals(rates, children, unclaimed).total)} unclaimed in total
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
                            <b>{fmtDate(r.date)}</b> — {describeExpense(rates, children, r)}
                            {r.paid ? " · Paid" : ""}
                          </span>
                          <span style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
                            <Link className="chip" href={`/dashboard/entries?edit=${r.id}`}>
                              ✏️ Edit
                            </Link>{" "}
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
          <h3>Medication log — {fmtMonthLabel(thisMonth)}</h3>
          {monthRecs.filter((r) => r.bucket === "meds").length === 0 && <p className="empty">Nothing this month.</p>}
          {monthRecs
            .filter((r) => r.bucket === "meds")
            .map((r) => (
              <div className="rec" key={r.id}>
                {describeMeds(r)} <small className="muted">— {fmtDate(r.date)}</small>
              </div>
            ))}
        </div>
      )}

      {tab === "handover" && <HandoverTab />}

      {tab === "hub" && <HubLogTab />}
      {tab === "annualReview" && <AnnualReviewTab />}
      {tab === "forms" && (
        <div className="card">
          <FormsReference />
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
  const monthLabel = fmtMonthLabel(thisMonth);

  const text = (() => {
    let out = `Everyone — ${monthLabel}\n`;
    (Object.keys(BUCKETS) as Bucket[]).forEach((k) => {
      const rs = records.filter((r) => r.bucket === k || r.also_in.includes(k)).sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (!rs.length) return;
      out += `\n${BUCKETS[k].toUpperCase()}\n`;
      if (k === "expenses") {
        rs.forEach((r) => (out += `  ${fmtDate(r.date)}: ${describeExpense(rates, kids, r)}\n`));
        out += `Total: ${gbp(expenseTotals(rates, kids, rs).total)}\n`;
      } else {
        rs.forEach((r) => (out += `  ${fmtDate(r.date)}${r.child ? ` (${r.child})` : ""}: ${r.bucket === "meds" ? describeMeds(r) : r.text}${r.done ? " ✓" : ""}\n`));
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
      <p className="note">
        Raw material for your diaries and other reports, an expense claim, or a social worker update — read it
        through before it goes anywhere.
      </p>
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
    </div>
  );
}

function namesOf(r: EntryRecord): string[] {
  return r.kids.length ? r.kids : r.child ? [r.child] : [];
}

type ChildSupervisionGroup = {
  name: string;
  openFollowUps: EntryRecord[];
  unreported: { key: string; text: string }[];
  toRaise: EntryRecord[];
};

function GroupCard({ g }: { g: ChildSupervisionGroup }) {
  return (
    <div style={{ marginTop: 10 }}>
      <h4 style={{ margin: "0 0 4px" }}>{g.name}</h4>
      {g.openFollowUps.map((r) => (
        <div key={r.id} className="rec" style={{ borderLeft: "3px solid var(--danger)" }}>
          <b>Still open:</b> {FLAGS[r.flag as FlagKey]?.label || r.flag}
          {r.flag_note ? ` — ${r.flag_note}` : ""}
          <br />
          <small className="muted">{fmtDate(r.date)}</small>
        </div>
      ))}
      {g.unreported.map((u) => (
        <div key={u.key} className="rec" style={{ borderLeft: "3px solid var(--danger)" }}>
          {u.text}
        </div>
      ))}
      {g.toRaise.map((r) => (
        <div key={r.id} className="rec">
          {r.text}
          <br />
          <small className="muted">{fmtDate(r.date)}</small>
        </div>
      ))}
    </div>
  );
}

function SupervisionReport({
  records,
  training,
  allChildren,
}: {
  records: EntryRecord[];
  training: TrainingCompletion[];
  allChildren: Child[];
}) {
  const [sinceDate, setSinceDate] = useState(addDays(today(), -30));
  const [copyMsg, setCopyMsg] = useState("");

  // An open follow-up or an unreported incident stays relevant across a
  // month boundary until it's actually dealt with, so those two ignore
  // "since" entirely -- only the explicit "to raise" notes and training
  // completions are date-scoped.
  // "reminder" is just a calendar nudge (a club day, lunch-money reminder),
  // not something that's actually happened with a child worth raising at
  // supervision -- same exclusion /api/cla-summary already makes.
  const openFollowUps = [...records]
    .filter((r) => r.flag && r.flag !== "reminder" && !r.flag_done)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const incidentRecords = records.filter((r) => r.bucket === "incident");
  const unreported = unreportedIncidentItems(
    incidentRecords.map((r) => ({ id: r.id, text: r.text, created_at: r.created_at, reported: r.reported })),
  );
  const toRaise = records
    .filter((r) => (r.bucket === "supervision" || r.also_in.includes("supervision")) && r.date >= sinceDate)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const trainingDone = [...training].filter((t) => t.completedOn >= sinceDate).sort((a, b) => b.completedOn.localeCompare(a.completedOn));

  // Grouped per child, in the same order children appear everywhere else in
  // the app, so a busy supervision session is easy to work through child by
  // child rather than hunting through one long flat list for what matters.
  const allNames = new Set<string>();
  [...openFollowUps, ...incidentRecords, ...toRaise].forEach((r) => namesOf(r).forEach((n) => allNames.add(n)));
  // dedupe by name -- a child can have more than one row on file (e.g. an
  // accidental duplicate from auto-detection), which would otherwise build
  // an identical group twice, one per row.
  const seenNames = new Set<string>();
  const knownOrder = sortChildren(allChildren.filter((c) => allNames.has(c.name)))
    .map((c) => c.name)
    .filter((n) => (seenNames.has(n) ? false : (seenNames.add(n), true)));
  const extraNames = [...allNames].filter((n) => !knownOrder.includes(n)).sort((a, b) => a.localeCompare(b));
  const childOrder = [...knownOrder, ...extraNames];

  const childGroups: ChildSupervisionGroup[] = childOrder
    .map((name) => {
      const myIncidents = incidentRecords.filter((r) => namesOf(r).includes(name));
      return {
        name,
        openFollowUps: openFollowUps.filter((r) => namesOf(r).includes(name)),
        unreported: unreportedIncidentItems(myIncidents.map((r) => ({ id: r.id, text: r.text, created_at: r.created_at, reported: r.reported }))),
        toRaise: toRaise.filter((r) => namesOf(r).includes(name)),
      };
    })
    .filter((g) => g.openFollowUps.length || g.unreported.length || g.toRaise.length);

  const generalGroup: ChildSupervisionGroup = {
    name: "General",
    openFollowUps: openFollowUps.filter((r) => !namesOf(r).length),
    unreported: unreportedIncidentItems(
      incidentRecords.filter((r) => !namesOf(r).length).map((r) => ({ id: r.id, text: r.text, created_at: r.created_at, reported: r.reported })),
    ),
    toRaise: toRaise.filter((r) => !namesOf(r).length),
  };
  const hasGeneral = generalGroup.openFollowUps.length > 0 || generalGroup.unreported.length > 0 || generalGroup.toRaise.length > 0;

  function groupText(g: ChildSupervisionGroup): string {
    let out = "";
    if (g.openFollowUps.length) {
      out += `  Still open — follow up:\n`;
      g.openFollowUps.forEach((r) => {
        const label = FLAGS[r.flag as FlagKey]?.label || r.flag;
        out += `    ${fmtDate(r.date)}: ${label}${r.flag_note ? ` -- ${r.flag_note}` : ""}\n`;
      });
    }
    if (g.unreported.length) {
      out += `  Incidents not yet reported:\n`;
      g.unreported.forEach((u) => (out += `    ${u.text}\n`));
    }
    if (g.toRaise.length) {
      out += `  To raise:\n`;
      g.toRaise.forEach((r) => (out += `    ${fmtDate(r.date)}: ${r.text}\n`));
    }
    return out;
  }

  const text = (() => {
    let out = `Supervision — items since ${fmtDate(sinceDate)}\n`;
    if (!childGroups.length && !hasGeneral) out += `\nNothing outstanding for any child in this period.\n`;
    childGroups.forEach((g) => (out += `\n${g.name.toUpperCase()}\n${groupText(g)}`));
    if (hasGeneral) out += `\nGENERAL (not about a specific child)\n${groupText(generalGroup)}`;
    if (trainingDone.length) {
      out += `\nTRAINING COMPLETED\n`;
      trainingDone.forEach(
        (t) => (out += `  ${fmtDate(t.completedOn)}: ${t.title}${t.length ? ` (${t.length})` : ""}${t.url ? ` — ${t.url}` : ""}\n`),
      );
    }
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
      <h3>Supervision</h3>
      <p className="note">
        Everything worth mentioning at your next supervision, grouped per child so it&apos;s easy to work through —
        open follow-ups you haven&apos;t resolved yet, anything you&apos;ve logged to raise, unreported incidents,
        and training you&apos;ve completed.
      </p>
      <div className="row" style={{ alignItems: "center", marginTop: 6 }}>
        <label className="hint" style={{ flex: "0 0 auto" }}>
          Show since
        </label>
        <input type="date" style={{ flex: "0 0 170px" }} value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} />
      </div>
      <p style={{ marginTop: 10 }}>
        {openFollowUps.length} still open · {unreported.length} unreported incident{unreported.length === 1 ? "" : "s"} · {toRaise.length}{" "}
        logged to raise · {trainingDone.length} training completed
      </p>

      {!childGroups.length && !hasGeneral && <p className="note">Nothing outstanding for any child in this period.</p>}
      {childGroups.map((g) => (
        <GroupCard key={g.name} g={g} />
      ))}
      {hasGeneral && <GroupCard g={generalGroup} />}

      <details style={{ marginTop: 14 }}>
        <summary className="hint">Copy as plain text</summary>
        <pre id="rep">{text}</pre>
        <button className="btn" onClick={copy}>
          Copy report
        </button>
        {copyMsg && <span className="hint"> {copyMsg}</span>}
      </details>

      {trainingDone.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginBottom: 4 }}>
            Training completed — tap to open and refresh your memory
          </p>
          {trainingDone.map((t, i) => (
            <div key={t.title + t.completedOn + i} className="rec">
              <b>{t.title}</b>
              {t.url ? (
                <>
                  {" — "}
                  <a href={t.url} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                </>
              ) : (
                " — no link on file for this one"
              )}
              <br />
              <small className="muted">
                {[fmtDate(t.completedOn), t.length, t.platform].filter(Boolean).join(" · ")}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A hub carer/satellite carer is just a household_visitors row with one of
// these two roles (see migration 0065) -- a partner links to them via
// linked_visitor_id, same grouping HubLogTab and About Us's Visitors wheel
// already use.
const HUB_ROLES = ["Mockingbird hub carer", "Mockingbird satellite carer"];

type HubVisitorRow = { id: string; name: string; phone: string; email: string; role: string; linked_visitor_id: string | null };
type HubLogEntry = { id: string; date: string; carer_names: string; support_type: string; amount: number | null; notes: string };

function hubTypeLabel(key: string): string {
  return HUB_SUPPORT_TYPES.find(([k]) => k === key)?.[1] || key;
}

// A tidy, read-only roll-up for bringing to supervision -- not another
// place to edit the roster or log (that's the Hub tab) -- so nothing here
// gets left half-done mid-supervision by accident.
function MockingbirdSummary() {
  const [household, setHousehold] = useState<{
    is_mockingbird: boolean | null;
    hub_leader_name: string;
    hub_leader_phone: string;
    hub_leader_email: string;
  } | null>(null);
  const [visitors, setVisitors] = useState<HubVisitorRow[]>([]);
  const [hubChildren, setHubChildren] = useState<Child[]>([]);
  const [logs, setLogs] = useState<HubLogEntry[]>([]);
  const [sinceDate, setSinceDate] = useState(addDays(today(), -90));
  const [loaded, setLoaded] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [hhRes, visitorsRes, kidsRes, hhKidsRes, { data: logRows }] = await Promise.all([
        fetch("/api/household").then((r) => r.json()),
        fetch("/api/household-visitors").then((r) => r.json()),
        fetch("/api/children").then((r) => r.json()),
        fetch("/api/household-children").then((r) => r.json()),
        supabase.from("hub_support_log").select("*").order("date", { ascending: false }),
      ]);
      setHousehold(hhRes.household ?? null);
      setVisitors((visitorsRes.visitors as HubVisitorRow[]) ?? []);
      const kids = (kidsRes.children as Child[]) ?? [];
      const hhKids = ((hhKidsRes.children as Child[]) ?? []).map((c) => ({ ...c, family: "", lives_here: true }) as Child);
      setHubChildren(sortChildren([...kids, ...hhKids]));
      setLogs((logRows as HubLogEntry[]) ?? []);
      setLoaded(true);
    }
    load();
  }, []);

  if (!loaded) return <p className="muted">Loading…</p>;

  const hubVisitors = visitors.filter((v) => HUB_ROLES.includes(v.role));
  const hubVisitorIds = new Set(hubVisitors.map((v) => v.id));
  const primaries = hubVisitors.filter((v) => !v.linked_visitor_id || !hubVisitorIds.has(v.linked_visitor_id));
  const partnersOf = (id: string) => hubVisitors.filter((v) => v.linked_visitor_id === id);
  const linkedKids = hubChildren.filter((c) => c.linked_visitor_id && hubVisitorIds.has(c.linked_visitor_id));
  const taggedKids = hubChildren.filter(
    (c) => (c.mockingbird === "mb5" || c.mockingbird === "another") && !linkedKids.some((k) => k.id === c.id),
  );
  const allHubKids = [...linkedKids, ...taggedKids];

  const events = logs.filter((l) => l.date >= sinceDate);
  const tally: Record<string, { count: number; total: number; hasAmount: boolean }> = {};
  events.forEach((e) => {
    const s = (tally[e.support_type] ||= { count: 0, total: 0, hasAmount: false });
    s.count += 1;
    if (e.amount != null) {
      s.total += e.amount;
      s.hasAmount = true;
    }
  });

  if (!household?.is_mockingbird && !hubVisitors.length && !allHubKids.length && !logs.length) return null;

  const text = (() => {
    let out = "Mockingbird — summary\n\n";
    out +=
      household?.is_mockingbird === true
        ? "Part of Mockingbird"
        : household?.is_mockingbird === false
          ? "Not part of Mockingbird"
          : "Mockingbird status not set";
    if (household?.hub_leader_name) {
      out += ` — hub leader ${household.hub_leader_name}${household.hub_leader_phone ? ", " + household.hub_leader_phone : ""}${household.hub_leader_email ? ", " + household.hub_leader_email : ""}`;
    }
    out += "\n\nADULTS\n";
    if (!primaries.length) out += "  None on file.\n";
    primaries.forEach((v) => {
      const partners = partnersOf(v.id);
      const names = [v, ...partners].map((p) => p.name).join(" & ");
      out += `  ${names}${v.phone ? " — " + v.phone : ""}${v.email ? " — " + v.email : ""}\n`;
    });
    out += "\nCHILDREN\n";
    if (!allHubKids.length) out += "  None on file.\n";
    allHubKids.forEach((c) => {
      const via = c.linked_visitor_id ? hubVisitors.find((v) => v.id === c.linked_visitor_id)?.name : "";
      out += `  ${c.name}${via ? ` (${via}'s)` : ""}\n`;
    });
    out += `\nEVENTS since ${fmtDate(sinceDate)}\n`;
    if (!events.length) out += "  Nothing logged in this period.\n";
    events.forEach(
      (e) =>
        (out += `  ${fmtDate(e.date)}: ${hubTypeLabel(e.support_type)}${e.carer_names ? " — " + e.carer_names : ""}${e.notes ? " — " + e.notes : ""}\n`),
    );
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
      <h3>Mockingbird</h3>
      <p className="note">
        Everything Mockingbird worth mentioning at supervision — your hub&apos;s adults and children, and what&apos;s
        happened since the date below. Add or edit the roster and log itself from the Hub tab.
      </p>
      <div className="row" style={{ alignItems: "center", marginTop: 6 }}>
        <label className="hint" style={{ flex: "0 0 auto" }}>
          Events since
        </label>
        <input type="date" style={{ flex: "0 0 170px" }} value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} />
      </div>

      <h4 style={{ marginTop: 14 }}>Adults</h4>
      {!primaries.length && <p className="muted">None on file yet.</p>}
      {primaries.map((v) => {
        const partners = partnersOf(v.id);
        const kids = allHubKids.filter((c) => c.linked_visitor_id === v.id || partners.some((p) => p.id === c.linked_visitor_id));
        return (
          <div key={v.id} className="rec">
            <b>{[v, ...partners].map((p) => p.name).join(" & ")}</b>
            {(v.phone || v.email) && (
              <>
                <br />
                <small className="muted">{[v.phone, v.email].filter(Boolean).join(" · ")}</small>
              </>
            )}
            {kids.length > 0 && (
              <>
                <br />
                <small className="muted">Children: {kids.map((c) => c.name).join(", ")}</small>
              </>
            )}
          </div>
        );
      })}
      {taggedKids.length > 0 && (
        <p className="hint" style={{ marginTop: 8 }}>
          Also linked to Mockingbird, not tied to a specific carer above: {taggedKids.map((c) => c.name).join(", ")}
        </p>
      )}

      <h4 style={{ marginTop: 14 }}>Events</h4>
      {Object.keys(tally).length > 0 && (
        <div className="note" style={{ marginBottom: 10 }}>
          <b>Totals</b>
          {HUB_SUPPORT_TYPES.filter(([k]) => tally[k]).map(([k, l]) => {
            const s = tally[k];
            return (
              <div key={k} style={{ marginTop: 4 }}>
                {l}: {s.count} entr{s.count === 1 ? "y" : "ies"}
                {s.hasAmount ? ` — ${s.total}` : ""}
              </div>
            );
          })}
        </div>
      )}
      {!events.length && <p className="muted">Nothing logged in this period.</p>}
      {events.map((e) => (
        <div key={e.id} className="rec">
          {e.notes || hubTypeLabel(e.support_type)}
          <br />
          <small className="muted">
            {fmtDate(e.date)} · {hubTypeLabel(e.support_type)}
            {e.carer_names ? " · " + e.carer_names : ""}
            {e.amount != null ? " · " + e.amount : ""}
          </small>
        </div>
      ))}

      <details style={{ marginTop: 14 }}>
        <summary className="hint">Copy as plain text</summary>
        <pre id="rep">{text}</pre>
        <button className="btn" onClick={copy}>
          Copy report
        </button>
        {copyMsg && <span className="hint"> {copyMsg}</span>}
      </details>
    </div>
  );
}

// Which basics fields (see lib/basics.ts) are worth having to hand at a CLA
// review -- everything except Food (not something an IRO asks about) and the
// Authority section's delegated-authority checklist (useful day to day, but
// too long to belong on a one-page prep sheet).
const CLA_SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Placement", keys: ["status", "type", "start", "la"] },
  {
    title: "Social work team",
    keys: ["csw", "csw_phone", "csw_email", "cswm", "cswm_phone", "cswm_email", "iro", "iro_phone", "iro_email", "duty"],
  },
  { title: "Health", keys: ["gp", "nhs", "allergies", "dentist", "recurring_checks", "laceh"] },
  { title: "Education", keys: ["school", "teacher", "pep", "send"] },
  { title: "Family & contact", keys: ["contact", "nocontact", "family", "cc_contact", "cc_phone"] },
  { title: "Key dates", keys: ["review_last", "review_next", "visit_last", "visit_next", "other"] },
  { title: "Authority", keys: ["photos", "notes"] },
];

function basicsField(sectionTitle: string, key: string) {
  return BASICS_SECTIONS.find((s) => s.title === sectionTitle)?.fields.find((f) => f.key === key);
}

// A repeatable field (key contacts, other dates) is stored as a JSON array --
// see parseRepeatableItems in AboutScreen.tsx for the input side of this.
function formatBasicsValue(field: ReturnType<typeof basicsField>, raw: string): string {
  if (!raw) return "";
  if (field?.repeatableFields) {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return "";
      return arr
        .map((it: Record<string, string>) => field.repeatableFields!.map((sf) => it[sf.key]).filter(Boolean).join(" · "))
        .filter(Boolean)
        .join("; ");
    } catch {
      return raw;
    }
  }
  return field?.type === "date" ? fmtDate(raw) : raw;
}

function ClaPrepReport({ childList, records }: { childList: ChildWithBasics[]; records: EntryRecord[] }) {
  // CLA reviews look back over the period since the last one -- defaulting
  // to 6 months covers the usual review cycle without her having to work it
  // out per child; the field's right there to correct per meeting anyway.
  const [sinceDate, setSinceDate] = useState(addDays(today(), -180));
  const [copyMsg, setCopyMsg] = useState("");
  // A written-out summary paragraph per child (from /api/cla-summary) rather
  // than a bullet list of every single flagged/incident/to-raise entry --
  // fetched on demand per child since it's an AI call, and cleared whenever
  // the review period changes since a summary is only ever true of the
  // period it was generated for.
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [summaryError, setSummaryError] = useState<Record<string, string>>({});

  async function generateSummary(childId: string, childName: string) {
    setSummarizing((prev) => ({ ...prev, [childId]: true }));
    setSummaryError((prev) => ({ ...prev, [childId]: "" }));
    try {
      const res = await fetch("/api/cla-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childName, sinceDate }),
      });
      const data = await res.json();
      if (data.error) setSummaryError((prev) => ({ ...prev, [childId]: data.error }));
      else setSummaries((prev) => ({ ...prev, [childId]: data.summary || "Nothing to summarise since this date." }));
    } catch {
      setSummaryError((prev) => ({ ...prev, [childId]: "Couldn't reach the summarising service — try again in a moment." }));
    }
    setSummarizing((prev) => ({ ...prev, [childId]: false }));
  }

  const sheets = childList.map((c) => {
    const basics = c.basics || {};
    const kidRecords = records.filter((r) => r.kids.includes(c.name));
    // "reminder" is excluded here -- it's just a calendar nudge (a club day,
    // a school-lunch-money reminder), not a CLA follow-up, and it stays
    // "open" until its date passes rather than because anyone resolved it.
    const openFollowUps = kidRecords.filter((r) => r.flag && r.flag !== "reminder" && !r.flag_done);
    const unreported = kidRecords.filter((r) => r.bucket === "incident" && !r.reported);
    const incidentsSince = kidRecords.filter((r) => r.bucket === "incident" && r.date >= sinceDate);
    const toRaise = kidRecords.filter((r) => (r.bucket === "supervision" || r.also_in.includes("supervision")) && r.date >= sinceDate);
    const itemCount = new Set([...openFollowUps, ...unreported, ...incidentsSince, ...toRaise].map((r) => r.id)).size;

    let profileOut = `CLA REVIEW PREP — ${c.name}\n`;
    let hadAnySection = false;
    CLA_SECTIONS.forEach((section) => {
      const rows = section.keys
        .map((key) => {
          const field = basicsField(section.title, key);
          const value = formatBasicsValue(field, basics[key] || "");
          return value ? `  ${field?.label || key}: ${value}\n` : "";
        })
        .join("");
      if (rows) {
        hadAnySection = true;
        profileOut += `\n${section.title.toUpperCase()}\n${rows}`;
      }
    });
    if (!hadAnySection) profileOut += `\n  Nothing filled in yet on ${c.name}'s profile — add it from About Us first.\n`;

    return { c, profileOut, itemCount, urgent: openFollowUps.length + unreported.length };
  });

  const text = sheets.length
    ? sheets
        .map(({ c, profileOut, itemCount }) => {
          let out = profileOut;
          out += `\nSINCE ${fmtDate(sinceDate)}\n`;
          const summary = summaries[c.id];
          if (summary) out += `  ${summary}\n`;
          else if (itemCount) out += `  (${itemCount} item${itemCount === 1 ? "" : "s"} not yet summarised — tap "Generate summary" above.)\n`;
          else out += `  Nothing flagged for ${c.name} in this period.\n`;
          return out;
        })
        .join("\n" + "—".repeat(32) + "\n\n")
    : "No children currently placed with you to prepare a CLA review for.";

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => setCopyMsg("Copied"),
      () => setCopyMsg("Couldn't copy"),
    );
    setTimeout(() => setCopyMsg(""), 2000);
  }

  return (
    <div className="card">
      <h3>CLA review prep</h3>
      <p className="note">
        Everything worth having to hand before a Child Looked After review — health (dentist, optician, health
        assessment), education (PEP, SEND), key dates, social work and legal details from each child&apos;s profile,
        plus a summary of anything flagged, any incidents, and anything logged to raise since the date below.
      </p>
      <div className="row" style={{ alignItems: "center", marginTop: 6 }}>
        <label className="hint" style={{ flex: "0 0 auto" }}>
          Since (usually the last review)
        </label>
        <input
          type="date"
          style={{ flex: "0 0 170px" }}
          value={sinceDate}
          onChange={(e) => {
            setSinceDate(e.target.value);
            setSummaries({});
            setSummaryError({});
          }}
        />
      </div>

      {sheets.map(({ c, itemCount, urgent }) => (
        <div key={c.id} className="row" style={{ marginTop: 8, alignItems: "center" }}>
          <span className="hint" style={{ flex: 1 }}>
            {c.name}:{" "}
            {summaries[c.id]
              ? "summarised"
              : itemCount
                ? `${itemCount} item${itemCount === 1 ? "" : "s"} to summarise${urgent ? " (some still open)" : ""}`
                : "nothing to summarise"}
          </span>
          {itemCount > 0 && (
            <button className="chip" disabled={!!summarizing[c.id]} onClick={() => generateSummary(c.id, c.name)}>
              {summarizing[c.id] ? "Summarising…" : summaries[c.id] ? "Regenerate summary" : "Generate summary"}
            </button>
          )}
          {summaryError[c.id] && (
            <span className="hint" style={{ color: "var(--danger)" }}>
              {" "}
              {summaryError[c.id]}
            </span>
          )}
        </div>
      ))}

      <pre id="rep" style={{ marginTop: 12 }}>
        {text}
      </pre>
      <button className="btn" onClick={copy}>
        Copy prep sheet
      </button>
      {copyMsg && <span className="hint"> {copyMsg}</span>}
      {childList.length > 0 && (
        <p className="hint" style={{ marginTop: 8 }}>
          Missing something? Fill it in from About Us — this pulls straight from each child&apos;s profile.
        </p>
      )}
    </div>
  );
}
