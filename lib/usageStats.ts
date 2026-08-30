function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Consecutive days (including today or yesterday) with at least one entry. 0 if stale. */
export function currentStreak(dates: string[]): number {
  const set = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const cursor = set.has(toDateStr(today)) ? today : set.has(toDateStr(yesterday)) ? yesterday : null;
  if (!cursor) return 0;

  let count = 0;
  while (set.has(toDateStr(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr + "T00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

export type EntryDateRow = { user_id: string; entry_date: string; bucket: string };

export type CarerUsage = {
  user_id: string;
  totalEntries: number;
  entries7d: number;
  entries30d: number;
  lastEntryDate: string | null;
  daysSinceLastEntry: number | null;
  streak: number;
};

export function computeUsage(rows: EntryDateRow[]): Map<string, CarerUsage> {
  const byUser = new Map<string, string[]>();
  rows.forEach((r) => {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r.entry_date);
    byUser.set(r.user_id, arr);
  });

  const cutoff7 = toDateStr(new Date(Date.now() - 6 * 86400000));
  const cutoff30 = toDateStr(new Date(Date.now() - 29 * 86400000));

  const result = new Map<string, CarerUsage>();
  byUser.forEach((dates, userId) => {
    const sorted = [...dates].sort();
    const lastEntryDate = sorted[sorted.length - 1] ?? null;
    result.set(userId, {
      user_id: userId,
      totalEntries: dates.length,
      entries7d: dates.filter((d) => d >= cutoff7).length,
      entries30d: dates.filter((d) => d >= cutoff30).length,
      lastEntryDate,
      daysSinceLastEntry: daysSince(lastEntryDate),
      streak: currentStreak(dates),
    });
  });
  return result;
}
