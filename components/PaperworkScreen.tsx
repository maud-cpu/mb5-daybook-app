"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { describeExpense, describeMeds, expenseTotals, gbp, today } from "@/lib/domain";
import { addDays } from "@/lib/calendarHelpers";
import { unreportedIncidentItems } from "@/lib/thingsToDo";
import { BUCKETS, Bucket, Child, EntryRecord, FLAGS, FlagKey, Rates } from "@/lib/types";
import { BASICS_SECTIONS } from "@/lib/basics";
import DiaryTab from "@/components/DiaryTab";
import HandoverTab from "@/components/HandoverTab";
import HubLogTab from "@/components/HubLogTab";

type Tab = "month" | "supervision" | "cla" | "expenses" | "meds" | "diary" | "handover" | "hub";
type ChildWithBasics = Child & { basics: Record<string, string> };
type TrainingCompletion = { title: string; completedOn: string };

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtMonthLabel(ym: string): string {
  return new Date(ym + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function PaperworkScreen() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("month");
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [children, setChildren] = useState<ChildWithBasics[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [claimedOpen, setClaimedOpen] = useState(false);
  const [childFilter, setChildFilter] = useState<string[]>([]);
  const [trainingDone, setTrainingDone] = useState<TrainingCompletion[]>([]);

  function toggleChildFilter(name: string) {
    setChildFilter((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

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
      const [{ data: recs }, { data: kids }, { data: hhKids }, { data: r }, { data: training }] = await Promise.all([
        supabase.from("records").select("*").order("date", { ascending: false }),
        supabase.from("children").select("id, name, born, family, lives_here, category, basics"),
        // A child in "Children in your household" can be an actual foster
        // placement too, not just the carer's own/adopted/kinship child --
        // include them so month reports and expense filters cover them too.
        supabase.from("household_children").select("id, name, born, category, basics"),
        supabase.from("shared_rates").select("*").single(),
        supabase.from("training_progress").select("course_title, completed_on").not("completed_on", "is", null),
      ]);
      setRecords((recs as EntryRecord[]) ?? []);
      setChildren([
        ...((kids as ChildWithBasics[]) ?? []).map((c) => ({ ...c, basics: c.basics || {} })),
        ...(((hhKids as (Pick<Child, "id" | "name" | "born" | "category"> & { basics: Record<string, string> })[]) ?? []).map(
          (h) => ({ ...h, family: "", lives_here: true, basics: h.basics || {} }) as ChildWithBasics,
        )),
      ]);
      setRates(r as Rates);
      setTrainingDone(
        ((training as { course_title: string; completed_on: string }[] | null) ?? []).map((t) => ({
          title: t.course_title,
          completedOn: t.completed_on,
        })),
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
        {(["month", "supervision", "cla", "expenses", "meds", "diary", "handover", "hub"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "month"
              ? "Month"
              : t === "supervision"
                ? "Supervision"
                : t === "cla"
                  ? "CLA prep"
                  : t === "expenses"
                    ? "Expenses"
                    : t === "meds"
                      ? "Medication"
                      : t === "diary"
                        ? "Diary for SW"
                        : t === "handover"
                          ? "Handover"
                          : "Hub log"}
          </button>
        ))}
      </div>

      {["month", "supervision", "cla", "expenses", "meds"].includes(tab) && children.length > 0 && (
        <div className="chips" style={{ marginTop: 10 }}>
          {children.map((c) => (
            <button
              key={c.id}
              className={`chip${childFilter.includes(c.name) ? " on" : ""}`}
              onClick={() => toggleChildFilter(c.name)}
            >
              {c.name}
            </button>
          ))}
          {childFilter.length > 0 && (
            <button className="chip" onClick={() => setChildFilter([])}>
              Clear
            </button>
          )}
        </div>
      )}

      {tab === "diary" && <DiaryTab />}

      {tab === "month" && rates && <MonthReport records={monthRecs} kids={children} rates={rates} thisMonth={thisMonth} />}

      {tab === "supervision" && <SupervisionReport records={supervisionRecs} training={trainingDone} />}

      {tab === "cla" && <ClaPrepReport childList={claChildren} records={records} />}

      {tab === "expenses" && rates && (
        <div className="card">
          <h3>Expenses — {fmtMonthLabel(thisMonth)}</h3>
          {(() => {
            const all = monthRecs.filter((r) => r.bucket === "expenses");
            const unclaimed = all.filter((r) => !r.claimed);
            const claimed = all.filter((r) => r.claimed);
            return (
              <>
                {unclaimed.length === 0 && <p className="empty">Nothing unclaimed this month.</p>}
                {unclaimed.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <span style={{ flex: 1 }}>{describeExpense(rates, children, r)}</span>
                    <Link className="chip" style={{ flex: "0 0 auto" }} href={`/dashboard/entries?edit=${r.id}`}>
                      ✏️ Edit
                    </Link>
                    <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => setClaimed(r.id, true)}>
                      ✓ Claimed
                    </button>
                  </div>
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

function SupervisionReport({ records, training }: { records: EntryRecord[]; training: TrainingCompletion[] }) {
  const [sinceDate, setSinceDate] = useState(addDays(today(), -30));
  const [copyMsg, setCopyMsg] = useState("");

  // An open follow-up or an unreported incident stays relevant across a
  // month boundary until it's actually dealt with, so those two ignore
  // "since" entirely -- only the explicit "to raise" notes and training
  // completions are date-scoped.
  const openFollowUps = [...records]
    .filter((r) => r.flag && !r.flag_done)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unreported = unreportedIncidentItems(
    records.filter((r) => r.bucket === "incident").map((r) => ({ id: r.id, text: r.text, created_at: r.created_at, reported: r.reported })),
  );
  const toRaise = records
    .filter((r) => (r.bucket === "supervision" || r.also_in.includes("supervision")) && r.date >= sinceDate)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const trainingDone = [...training].filter((t) => t.completedOn >= sinceDate).sort((a, b) => b.completedOn.localeCompare(a.completedOn));

  const text = (() => {
    let out = `Supervision — items since ${fmtDate(sinceDate)}\n`;
    if (openFollowUps.length) {
      out += `\nSTILL OPEN -- FOLLOW UP\n`;
      openFollowUps.forEach((r) => {
        const label = FLAGS[r.flag as FlagKey]?.label || r.flag;
        out += `  ${fmtDate(r.date)}${r.child ? ` (${r.child})` : ""}: ${label}${r.flag_note ? ` -- ${r.flag_note}` : ""}\n`;
      });
    }
    if (unreported.length) {
      out += `\nINCIDENTS NOT YET REPORTED\n`;
      unreported.forEach((u) => (out += `  ${u.text}\n`));
    }
    out += `\nTO RAISE\n`;
    if (!toRaise.length) out += `  Nothing logged under Supervision in this period.\n`;
    toRaise.forEach((r) => (out += `  ${fmtDate(r.date)}${r.child ? ` (${r.child})` : ""}: ${r.text}\n`));
    if (trainingDone.length) {
      out += `\nTRAINING COMPLETED\n`;
      trainingDone.forEach((t) => (out += `  ${fmtDate(t.completedOn)}: ${t.title}\n`));
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
        Everything worth mentioning at your next supervision, pulled together automatically — open follow-ups you
        haven&apos;t resolved yet, anything you&apos;ve logged to raise, unreported incidents, and training
        you&apos;ve completed.
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
      <pre id="rep">{text}</pre>
      <button className="btn" onClick={copy}>
        Copy report
      </button>
      {copyMsg && <span className="hint"> {copyMsg}</span>}
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
  { title: "Health", keys: ["gp", "nhs", "allergies", "dentist", "laceh"] },
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
