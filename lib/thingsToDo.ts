import { bandChangeSoon, today } from "@/lib/domain";
import { Child, Reminder } from "@/lib/types";

export type DueItem = {
  key: string;
  urgent: boolean;
  text: string;
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

export function bandChangeItems(children: Child[]): DueItem[] {
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

export function missingNumbersItems(children: (Child & { basics: Record<string, string> })[]): DueItem[] {
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

export function dueReminders(reminders: Reminder[]): DueItem[] {
  const t = today();
  return reminders
    .filter((r) => !r.done && r.date <= t)
    .map((r) => ({
      key: "rem-" + r.id,
      urgent: r.date < t,
      text: r.text + (r.date < t ? ` (overdue ${r.date})` : ""),
    }));
}

export function upcomingReminders(reminders: Reminder[]): Reminder[] {
  const t = today();
  return reminders.filter((r) => !r.done && r.date > t).sort((a, b) => a.date.localeCompare(b.date));
}
