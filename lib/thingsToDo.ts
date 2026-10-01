import { bandChangeSoon, today } from "@/lib/domain";
import { Child, Diary, Reminder } from "@/lib/types";

export type DueItem = {
  key: string;
  urgent: boolean;
  text: string;
  /** Extra context to show when tapped -- e.g. a reminder's source_text,
   * the body of a news item that was added straight to Things To Do. */
  detail?: string;
};

export type IncidentLike = { id: string; text: string; created_at: string; reported: string | null };

export function unreportedIncidentItems(incidents: IncidentLike[]): DueItem[] {
  const now = Date.now();
  return incidents
    .filter((r) => !r.reported)
    .map((r) => {
      const hours = (now - new Date(r.created_at).getTime()) / 36e5;
      const suffix = hours > 24 ? " — over 24 hours" : ` — ${Math.max(0, Math.round(24 - hours))} hrs left`;
      return {
        key: "inc-" + r.id,
        urgent: true,
        text: `Incident not yet reported${suffix}: ${r.text.slice(0, 60)}…`,
      };
    });
}

export function bandChangeItems(children: Pick<Child, "id" | "name" | "born">[]): DueItem[] {
  return children
    .map((c) => ({ c, change: bandChangeSoon(c) }))
    .filter((x) => x.change)
    .map((x) => ({ key: "band-" + x.c.id, urgent: false, text: `${x.c.name} ${x.change} — day-care rate changes` }));
}

const ESSENTIAL_CHILD_FIELDS: [string, string][] = [
  ["csw", "child's social worker"],
  ["duty", "team duty line"],
  ["gp", "GP practice"],
];

export function missingNumbersItems(children: (Pick<Child, "id" | "name"> & { basics: Record<string, string> })[]): DueItem[] {
  return children
    .map((c) => {
      const b = c.basics || {};
      const missing = ESSENTIAL_CHILD_FIELDS.filter(([k]) => !(b[k] || "").trim()).map(([, label]) => label);
      return { c, missing };
    })
    .filter((x) => x.missing.length)
    .map((x) => ({
      key: "nums-" + x.c.id,
      urgent: false,
      text: `${x.c.name}: add ${x.missing.join(", ")} — About us`,
    }));
}

export function invoiceMonthItems(invoiceDay: number, payDay: number, hasUnpaidClaimed: boolean): DueItem[] {
  const out: DueItem[] = [];
  const now = new Date();
  const d = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (d >= lastDay - 3) {
    out.push({
      key: "inv-monthend",
      urgent: false,
      text: `Month end in ${lastDay - d} day${lastDay - d === 1 ? "" : "s"} — check expenses & day-care reasons before invoicing`,
    });
  }
  if (d <= invoiceDay + 2) {
    out.push({ key: "inv-send", urgent: false, text: "Send last month's expenses claim" });
  }
  if (Math.abs(d - payDay) <= 1 && hasUnpaidClaimed) {
    out.push({ key: "payday", urgent: false, text: "Payday around now — check claimed expenses have actually been paid" });
  }
  return out;
}

export function edtMissingItem(edt: string): DueItem[] {
  return (edt || "").trim() ? [] : [{ key: "edt", urgent: false, text: "Add the Emergency Duty Team (out-of-hours) number — About us" }];
}

// Once a placement ends, the carer's diary/expenses/meds records for that
// child stop being needed day-to-day and should go to the supervising social
// worker or be removed, per the fostering provider's retention policy --
// this is the one nudge that must not just quietly disappear once overdue.
export function placementEndItems(children: Pick<Child, "id" | "name" | "placement_end_date">[]): DueItem[] {
  const t = today();
  const WARN_DAYS = 14;
  const warnFrom = new Date();
  warnFrom.setDate(warnFrom.getDate() + WARN_DAYS);
  const warnFromStr = warnFrom.toISOString().slice(0, 10);
  return children
    .filter((c) => c.placement_end_date)
    .map((c) => {
      const end = c.placement_end_date as string;
      if (end <= t) {
        return {
          key: "placement-end-" + c.id,
          urgent: true,
          text: `${c.name}'s placement ended ${end} — remove or pass on ${c.name}'s records now (check your supervising social worker / fostering provider for the exact retention period).`,
        };
      }
      if (end <= warnFromStr) {
        return {
          key: "placement-soon-" + c.id,
          urgent: false,
          text: `${c.name}'s placement ends ${end} — start preparing to remove or pass on ${c.name}'s records.`,
        };
      }
      return null;
    })
    .filter((x): x is DueItem => x !== null);
}

type RecurringCheck = { what?: string; last?: string; next?: string };

function parseRecurringChecks(raw: string): RecurringCheck[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Dentist, eye test, hearing test, or anything else that needs doing on a
// regular basis -- basics.recurring_checks (About us) holds a "next due"
// date per check; this surfaces it here the same way placementEndItems
// does, rather than leaving it as a field nobody's reminded to look at.
export function recurringCheckItems(children: (Pick<Child, "id" | "name"> & { basics: Record<string, string> })[]): DueItem[] {
  const t = today();
  const WARN_DAYS = 14;
  const warnFrom = new Date();
  warnFrom.setDate(warnFrom.getDate() + WARN_DAYS);
  const warnFromStr = warnFrom.toISOString().slice(0, 10);
  const out: DueItem[] = [];
  children.forEach((c) => {
    parseRecurringChecks(c.basics?.recurring_checks || "").forEach((check, i) => {
      if (!check.what?.trim() || !check.next) return;
      if (check.next <= t) {
        out.push({ key: `check-${c.id}-${i}`, urgent: false, text: `${c.name}'s ${check.what} was due ${check.next} — book it in` });
      } else if (check.next <= warnFromStr) {
        out.push({ key: `check-${c.id}-${i}`, urgent: false, text: `${c.name}'s ${check.what} due ${check.next}` });
      }
    });
  });
  return out;
}

// A reminder used to keep showing (turning red, "overdue [date]") for every
// day after its own date until manually ticked off -- which read as nagging
// clutter once the thing it was for had already happened (a meeting 3 days
// ago isn't still "due"). It now only shows from ADVANCE_DAYS before its own
// date (enough notice to actually prepare -- "Eli's school trip in 3 days,
// needs wellies" is only useful seen ahead of time) and drops off by itself
// once that day's passed, with no action needed -- the Calendar still has
// the full record if it's ever needed again.
const REMINDER_ADVANCE_DAYS = 3;

export function dueReminders(reminders: Reminder[]): DueItem[] {
  const t = today();
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + REMINDER_ADVANCE_DAYS);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);
  return reminders
    .filter((r) => !r.done && r.date >= t && r.date <= windowEndStr)
    .map((r) => ({
      key: "rem-" + r.id,
      urgent: false,
      text: r.date === t ? r.text : `${r.text} — ${new Date(r.date + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`,
      detail: r.source_text || undefined,
    }));
}

// Daily/weekly/fortnightly/monthly/termly, set per child (About us ->
// Social work team -> "Diary due") -- defaulting to 3 weeks if never set,
// since that's roughly what most placements expect without being told
// otherwise.
const DIARY_FREQUENCY_DAYS: Record<string, number> = {
  Daily: 1,
  Weekly: 7,
  Fortnightly: 14,
  Monthly: 30,
  Termly: 70,
};
const DEFAULT_DIARY_DAYS = 21;

export function diaryDueItems(
  children: (Pick<Child, "id" | "name"> & { basics: Record<string, string> })[],
  diaries: Pick<Diary, "child_names" | "sent_at" | "date_from" | "date_to">[],
): DueItem[] {
  const t = today();
  const out: DueItem[] = [];
  children.forEach((c) => {
    const days = DIARY_FREQUENCY_DAYS[c.basics?.diary_frequency || ""] ?? DEFAULT_DIARY_DAYS;
    // The period a diary covers (date_from/date_to) can genuinely differ from
    // when it was actually sent -- sent_at is the real answer when it's set,
    // falling back to the covered period for a diary logged before that
    // field existed.
    const lastSent = diaries
      .filter((d) => d.child_names.includes(c.name))
      .map((d) => d.sent_at || d.date_to || d.date_from)
      .filter((x): x is string => !!x)
      .sort()
      .pop();
    // Never nagged about a child with no diary history at all -- there's no
    // baseline to measure "overdue" against, and flagging every child the
    // moment this shipped would read as a sudden wall of nagging rather than
    // a useful nudge.
    if (!lastSent) return;
    const due = new Date(lastSent + "T12:00");
    due.setDate(due.getDate() + days);
    const dueStr = due.toISOString().slice(0, 10);
    if (dueStr <= t) {
      out.push({
        key: `diary-${c.id}`,
        urgent: false,
        text: `${c.name}'s diary to the SW is due — last sent ${lastSent}`,
      });
    }
  });
  return out;
}

// About us already records a CLA review and SW statutory visit "next due"
// date per child (Key dates) -- nothing ever actually nudged off them before
// now. Same warning window as recurringCheckItems, for the same reason: due
// shows as soon as it's actually passed, coming-up shows a little ahead so
// it's not a surprise.
export function statutoryDateItems(children: (Pick<Child, "id" | "name"> & { basics: Record<string, string> })[]): DueItem[] {
  const t = today();
  const WARN_DAYS = 14;
  const warnFrom = new Date();
  warnFrom.setDate(warnFrom.getDate() + WARN_DAYS);
  const warnFromStr = warnFrom.toISOString().slice(0, 10);
  const out: DueItem[] = [];
  const checks: [string, string][] = [
    ["review_next", "CLA review"],
    ["visit_next", "SW statutory visit"],
  ];
  children.forEach((c) => {
    checks.forEach(([key, label]) => {
      const next = c.basics?.[key];
      if (!next) return;
      if (next <= t) {
        out.push({ key: `stat-${key}-${c.id}`, urgent: false, text: `${c.name}'s ${label} was due ${next}` });
      } else if (next <= warnFromStr) {
        out.push({ key: `stat-${key}-${c.id}`, urgent: false, text: `${c.name}'s ${label} due ${next}` });
      }
    });
  });
  return out;
}
