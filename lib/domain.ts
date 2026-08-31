import { Band, Child, EntryRecord, Rates } from "@/lib/types";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  "kids" | "overnight" | "time_from" | "time_to" | "hours"
>;

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
      if (r.overnight) total += rates.overnight[b] * (first ? 1 : 0.8);
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
      events.push({ date: r.date, kid: k, overnight: r.overnight, hours: hoursOf(r), amount: 0, recordId: r.id });
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
    if (e.overnight) e.amount = rates.overnight[b] * (first ? 1 : 0.8);
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

export function gbp(n: number | null | undefined): string {
  return "£" + Number(n || 0).toFixed(2);
}

export function describeExpense(rates: Rates, children: Child[], r: EntryRecord): string {
  if (r.kind === "mileage") return `${r.miles} miles — ${r.text}`;
  if (r.kind === "daycare") {
    const who = r.kids.length ? r.kids.join(" & ") : "⚠ no child linked — priced as one child, band 5–10";
    const when = r.overnight
      ? "overnight"
      : r.time_from && r.time_to
        ? `${r.time_from}–${r.time_to} (${hoursOf(r)} hrs)`
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
    r.kids.length ? r.kids.join(" & ") : "",
    r.text,
  ]
    .filter(Boolean)
    .join(" — ");
}
