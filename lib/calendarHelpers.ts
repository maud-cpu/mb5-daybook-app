export const MAX_OCCURRENCES = 104; // ~2 years weekly -- a safety cap, not a real limit anyone should hit

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T12:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function occurrenceDates(start: string, until: string, repeat: string): string[] {
  const step = (d: string) => (repeat === "weekly" ? addDays(d, 7) : repeat === "fortnightly" ? addDays(d, 14) : addMonths(d, 1));
  const dates = [start];
  while (dates.length < MAX_OCCURRENCES) {
    const next = step(dates[dates.length - 1]);
    if (next > until) break;
    dates.push(next);
  }
  return dates;
}

export function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
