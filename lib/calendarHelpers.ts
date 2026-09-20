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

// A fixed palette rather than generated colours, so every colour stays
// legible on a light background and distinct from its neighbours.
const PERSON_PALETTE = [
  "#4f7cff",
  "#ff6b6b",
  "#2fbf71",
  "#e0a800",
  "#9b59b6",
  "#00a99d",
  "#e0576b",
  "#5c6bc0",
  "#ff8a3d",
  "#3d9970",
  "#c2185b",
  "#0288d1",
];

// Same name always lands on the same colour, with no colour assignment to
// store or keep in sync as people are added/renamed.
export function personColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_PALETTE[hash % PERSON_PALETTE.length];
}
