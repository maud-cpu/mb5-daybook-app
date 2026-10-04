import { AGE_ALLOWANCE_WEEKLY, Band, Child, EntryRecord, Rates } from "@/lib/types";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The model reliably transcribes a spoken/written time but occasionally
 * miscalculates the 12-to-24-hour conversion itself (caught live: "3pm til
 * 6pm" came back as time_from "14:00" -- an hour short of 3pm). Asking it
 * to transcribe the time as said instead, and doing this conversion here
 * in code, makes it deterministic rather than hoping the model's
 * arithmetic is right every time. Shared by /api/sort and
 * /api/extract-events, both of which need the same carer-said -> HH:MM
 * parsing for a reminder/daycare time.
 */
export function parseClockTime(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return /^\d{2}:\d{2}$/.test(s) ? s : "";
  let hour = Number(m[1]);
  const minute = m[2] ?? "00";
  const meridiem = m[3];
  if (hour > 23 || Number(minute) > 59) return "";
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function ageOf(child: Pick<Child, "born">, on = new Date()): number | null {
  if (!child.born) return null;
  const [y, m] = child.born.split("-").map(Number);
  let a = on.getFullYear() - y;
  if (on.getMonth() + 1 < m) a--;
  return a;
}

export function bandOf(child: Pick<Child, "born">, on = new Date()): Band {
  const a = ageOf(child, on);
  if (a === null) return "5-10";
  if (a < 5) return "0-4";
  if (a < 11) return "5-10";
  if (a < 14) return "11-13";
  return "14-18";
}

export function bandChangeSoon(child: Pick<Child, "born">): string {
  if (!child.born) return "";
  const now = bandOf(child);
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const nextBand = bandOf(child, d);
    if (nextBand !== now) {
      return `moves to ${nextBand} in ${d.toLocaleDateString("en-GB", { month: "short" })}`;
    }
  }
  return "";
}

/**
 * Household's own children first (alphabetical), then visiting children
 * grouped by family (each family alphabetical, families alphabetical by
 * name, ungrouped visiting children last) -- so a long roster is always
 * easy to scan instead of listed in whatever order rows were created.
 */
export function sortChildren<T extends { name: string }>(children: T[]): T[] {
  // Defensive: a stray duplicate row (e.g. the same real child accidentally
  // present in both the children and household_children tables) used to
  // show up twice everywhere this feeds into -- chips, filters, dropdowns --
  // which read as a much stranger bug than "one leftover row somewhere".
  // Keeping the first occurrence of a name is enough to make every list
  // read correctly regardless of whether the underlying duplicate has been
  // cleaned up yet.
  const seen = new Set<string>();
  const deduped = children.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Every screen that renders this list (Entries, Handover, Paperwork,
  // Capture, ...) shows it as a flat chip list with no household/visiting
  // or family grouping visible -- so a child who isn't "lives_here" or who
  // shares a family group used to get silently shoved after every other
  // child regardless of their name. Plain alphabetical is what every one
  // of those screens actually needs.
  return deduped.sort((a, b) => a.name.localeCompare(b.name));
}

export function findChild(children: Child[], name: string): Child | undefined {
  return children.find((c) => c.name === name);
}

export function familyOf(children: Child[], name: string): string {
  return findChild(children, name)?.family || "";
}

export function bandOfName(children: Child[], name: string): Band {
  const c = findChild(children, name);
  return bandOf(c || { born: null });
}

export function hoursOf(r: Pick<EntryRecord, "time_from" | "time_to" | "hours">): number {
  if (r.time_from && r.time_to) {
    const toDec = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h + m / 60;
    };
    let d = toDec(r.time_to) - toDec(r.time_from);
    if (d < 0) d += 24;
    return Math.round(d * 4) / 4;
  }
  return Number(r.hours || 0);
}

function bornOf(children: Child[], name: string): string {
  const c = findChild(children, name);
  return c?.born || "9999-99";
}

function eldestOf(children: Child[], kids: string[]): string {
  return [...kids].sort((a, b) => bornOf(children, a).localeCompare(bornOf(children, b)))[0];
}

type DaycareLike = Pick<
  EntryRecord,
  "kids" | "overnight" | "time_from" | "time_to" | "hours" | "reason" | "nights"
>;

/** The £ for one night/day of overnight day care, before multiplying by
 * how many nights a single record covers (see daycareAmount/daycareEvents). */
function perNightRate(rates: Rates, reason: string, band: Band, first: boolean): number {
  // "Carer respite" is a planned, care-plan-level overnight break -- paid,
  // per the Foster Care Finances document's "Sleepover Payments" section,
  // as the child's own weekly age-related allowance plus the carer's
  // usual Fostering Skills Payment, divided by seven. That's a different
  // (usually much lower) figure than the flat ad-hoc "Overnight" day-care
  // rate, which is only right for an unplanned babysit/sleepover.
  if (reason === "Carer respite") {
    const weekly = AGE_ALLOWANCE_WEEKLY[band] + (rates.skills_payment_weekly ?? 0);
    return (weekly / 7) * (first ? 1 : 0.8);
  }
  return rates.overnight[band] * (first ? 1 : 0.8);
}

/** Single-record estimate, used for the live "£ so far" preview while capturing. */
export function daycareAmount(rates: Rates, children: Child[], r: DaycareLike): number {
  const kids = r.kids.length ? r.kids : ["?"];
  let total = 0;
  const byFamily: Record<string, string[]> = {};
  kids.forEach((k) => {
    const fam = familyOf(children, k) || `solo-${k}`;
    (byFamily[fam] = byFamily[fam] || []).push(k);
  });
  Object.values(byFamily).forEach((group) => {
    const eldest = eldestOf(children, group);
    group.forEach((k) => {
      const b = bandOfName(children, k);
      const first = k === eldest;
      // A planned multi-night stay is ONE record covering several nights
      // (see "nights" on EntryRecord) -- billed as that many nights at
      // once, not held back to appear one row per elapsed night.
      if (r.overnight) total += perNightRate(rates, r.reason, b, first) * Math.max(1, r.nights || 1);
      else if (hoursOf(r) >= 5) total += first ? rates.day_first[b] : rates.day_add[b];
      else total += hoursOf(r) * (first ? rates.hour_first : rates.hour_add);
    });
  });
  return total;
}

type DaycareEvent = {
  date: string;
  kid: string;
  overnight: boolean;
  amount: number;
  recordId: string;
  reason: string;
  nights: number | null;
};

/**
 * Cross-record daycare pricing: expands every daycare/overnight record into
 * one priced event per child, drops a child's daytime hours for a date
 * already covered by their own overnight that date, and gives the
 * first-child (full) rate to whichever child in the family is eldest,
 * applied across separate records for the same date.
 */
export function daycareEvents(
  rates: Rates,
  children: Child[],
  recs: EntryRecord[],
): DaycareEvent[] {
  const dc = recs
    .filter((r) => r.kind === "daycare")
    .slice()
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  const overnightKeys = new Set<string>();
  dc.filter((r) => r.overnight).forEach((r) => r.kids.forEach((k) => overnightKeys.add(`${r.date}|${k}`)));

  const events: (DaycareEvent & { hours: number })[] = [];
  dc.forEach((r) => {
    const kids = r.kids.length ? r.kids : ["?"];
    kids.forEach((k) => {
      const key = `${r.date}|${k}`;
      if (!r.overnight && overnightKeys.has(key)) return;
      events.push({ date: r.date, kid: k, overnight: r.overnight, hours: hoursOf(r), amount: 0, recordId: r.id, reason: r.reason, nights: r.nights });
    });
  });

  const groups: Record<string, typeof events> = {};
  events.forEach((e) => {
    const fam = familyOf(children, e.kid) || `solo-${e.kid}`;
    const key = `${e.date}|${fam}`;
    (groups[key] = groups[key] || []).push(e);
  });
  Object.values(groups).forEach((grp) => {
    const eldest = eldestOf(children, grp.map((e) => e.kid));
    grp.forEach((e) => ((e as DaycareEvent & { first?: boolean }).first = e.kid === eldest));
  });

  events.forEach((e) => {
    const b = bandOfName(children, e.kid);
    const first = (e as DaycareEvent & { first?: boolean }).first;
    // Same reasoning as daycareAmount above -- a planned multi-night stay
    // is ONE record covering several nights, billed as that many nights
    // at once.
    if (e.overnight) e.amount = perNightRate(rates, e.reason, b, !!first) * Math.max(1, e.nights || 1);
    else if (e.hours >= 5) e.amount = first ? rates.day_first[b] : rates.day_add[b];
    else e.amount = e.hours * (first ? rates.hour_first : rates.hour_add);
  });

  return events;
}

export function mileageForDay(rates: Rates, date: string, recs: EntryRecord[]) {
  const rs = recs.filter((r) => r.kind === "mileage" && r.date === date);
  const miles = rs.reduce((s, r) => s + Number(r.miles || 0), 0);
  const claimable = Math.max(0, miles - rates.daily_deduct);
  return { miles, claimable, amount: claimable * rates.mileage };
}

export function expenseTotals(rates: Rates, children: Child[], recs: EntryRecord[]) {
  let purchase = 0;
  const days = new Set<string>();
  recs.forEach((r) => {
    if (r.kind === "mileage") days.add(r.date);
    else if (r.kind !== "daycare") purchase += Number(r.amount || 0);
  });
  let mileage = 0;
  days.forEach((d) => (mileage += mileageForDay(rates, d, recs).amount));
  const daycare = daycareEvents(rates, children, recs).reduce((s, e) => s + e.amount, 0);
  return { purchase, daycare, mileage, total: purchase + daycare + mileage };
}

export type TrainingStatus = { s: "todo" | "ok" | "soon" | "over"; label: string };

export function trainingStatus(is3yr: boolean, completedOn: string | undefined | null): TrainingStatus {
  if (!completedOn) return { s: "todo", label: "Not done" };
  if (!is3yr) return { s: "ok", label: "Done " + new Date(completedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) };
  const due = new Date(completedOn);
  due.setFullYear(due.getFullYear() + 3);
  const dueStr = due.toISOString().slice(0, 10);
  const daysLeft = (due.getTime() - new Date(today()).getTime()) / 86400000;
  const label = (daysLeft < 0 ? "Expired " : "Renew by ") + new Date(dueStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return { s: daysLeft < 0 ? "over" : daysLeft < 90 ? "soon" : "ok", label };
}

export function extractEmail(s: string | null | undefined): string {
  const m = (s || "").match(/([\w.+-]+@[\w-]+\.[\w.]+)/);
  return m ? m[0] : "";
}

export function extractPhone(s: string | null | undefined): string {
  const m = (s || "").match(/(0\d[\d ]{8,12})/);
  return m ? m[1].replace(/\s/g, "") : "";
}

export function gbp(n: number | null | undefined): string {
  return "£" + Number(n || 0).toFixed(2);
}

// Postgres "time" columns come back as "HH:MM:SS" -- nobody needs the
// seconds on a daycare start/end time.
function fmtTime(t: string): string {
  return t.slice(0, 5);
}

// A record's kids array is in whatever order they were tapped/added in --
// alphabetical reads far better wherever several names get joined for
// display (e.g. "Amelia & Zola" rather than however they happened to be
// selected).
function joinKids(kids: string[]): string {
  return [...kids].sort((a, b) => a.localeCompare(b)).join(" & ");
}

export function describeExpense(rates: Rates, children: Child[], r: EntryRecord): string {
  if (r.kind === "mileage") return `${r.miles} miles — ${r.text}`;
  if (r.kind === "daycare") {
    const who = r.kids.length ? joinKids(r.kids) : "⚠ no child linked — priced as one child, band 5–10";
    const when = r.overnight
      ? r.nights && r.nights > 1
        ? `${r.nights} nights`
        : "overnight"
      : r.time_from && r.time_to
        ? `${fmtTime(r.time_from)}–${fmtTime(r.time_to)} (${hoursOf(r)} hrs)`
        : `${Number(r.hours)} hrs`;
    return `${who} ${when} — ${gbp(daycareAmount(rates, children, r))}${r.reason ? " — " + r.reason : " — ⚠ no reason given"}${r.text ? " — " + r.text : ""}`;
  }
  return `${gbp(r.amount)} — ${r.text}`;
}

export function describeMeds(r: EntryRecord): string {
  return [
    r.med_name || "⚠ no medicine named",
    r.dose,
    r.given ? `at ${r.given}` : "",
    r.given_by ? `given by ${r.given_by}` : "",
    r.kids.length ? joinKids(r.kids) : "",
    r.text,
  ]
    .filter(Boolean)
    .join(" — ");
}
