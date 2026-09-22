import { createClient } from "@/lib/supabase/client";

export type SearchData = {
  people: { name: string; href: string }[];
  entries: { id: string; text: string; date: string; bucket: string }[];
  reminders: { id: string; text: string; date: string }[];
  courses: { id: string; title: string; url: string; description: string }[];
};

export type SearchResult = {
  key: string;
  kind: "person" | "entry" | "reminder" | "course";
  label: string;
  sub: string;
  href: string;
};

export async function loadSearchData(supabase: ReturnType<typeof createClient>): Promise<SearchData> {
  const [{ data: kids }, { data: hhKids }, { data: records }, { data: reminders }, { data: courses }] = await Promise.all([
    supabase.from("children").select("name"),
    supabase.from("household_children").select("name"),
    // 500 is generous headroom for a note-a-day diary, not a real cap for
    // normal use -- kept only so one runaway query can't pull the whole
    // table on every search-panel open.
    supabase.from("records").select("id, bucket, text, date").order("date", { ascending: false }).limit(500),
    supabase.from("reminders").select("id, text, date").eq("done", false),
    supabase.from("shared_training_catalog").select("id, title, url, description").eq("archived", false),
  ]);
  return {
    people: [
      ...((kids as { name: string }[] | null) ?? []).map((c) => ({
        name: c.name,
        href: `/dashboard/about?person=${encodeURIComponent(c.name)}`,
      })),
      ...((hhKids as { name: string }[] | null) ?? []).map((c) => ({
        name: c.name,
        href: `/dashboard/about?person=${encodeURIComponent(c.name)}`,
      })),
    ],
    entries: (records as { id: string; bucket: string; text: string; date: string }[] | null) ?? [],
    reminders: (reminders as { id: string; text: string; date: string }[] | null) ?? [],
    courses: (courses as { id: string; title: string; url: string; description: string }[] | null) ?? [],
  };
}

const BUCKET_LABELS: Record<string, string> = {
  diary: "Diary",
  supervision: "Supervision",
  expenses: "Expenses",
  meds: "Meds",
  sw: "Social worker log",
  incident: "Incident",
  scratch: "Just record",
};

/**
 * Every category filtered against the same query, each capped independently
 * at `limit` (Infinity for "show everything", a small number for a quick
 * preview panel). `counts` carries each category's TRUE match total so a
 * caller showing a capped preview can still say "6 entries" even though
 * only 5 are actually listed.
 */
export function filterSearchData(
  data: SearchData,
  query: string,
  limit: number = Infinity,
): { results: SearchResult[]; counts: Record<SearchResult["kind"], number> } {
  const q = query.trim().toLowerCase();
  const counts: Record<SearchResult["kind"], number> = { person: 0, entry: 0, reminder: 0, course: 0 };
  if (!q) return { results: [], counts };

  const results: SearchResult[] = [];

  const people = data.people.filter((p) => p.name.toLowerCase().includes(q));
  counts.person = people.length;
  people.slice(0, limit).forEach((p) => results.push({ key: `p:${p.name}`, kind: "person", label: p.name, sub: "Person", href: p.href }));

  const entries = data.entries.filter((e) => e.text.toLowerCase().includes(q));
  counts.entry = entries.length;
  entries.slice(0, limit).forEach((e) =>
    results.push({
      key: `e:${e.id}`,
      kind: "entry",
      label: e.text.length > 90 ? e.text.slice(0, 90) + "…" : e.text,
      sub: `${BUCKET_LABELS[e.bucket] || e.bucket} · ${e.date}`,
      href: `/dashboard/entries?edit=${e.id}`,
    }),
  );

  const reminders = data.reminders.filter((r) => r.text.toLowerCase().includes(q));
  counts.reminder = reminders.length;
  reminders
    .slice(0, limit)
    .forEach((r) => results.push({ key: `r:${r.id}`, kind: "reminder", label: r.text, sub: `Calendar · ${r.date}`, href: `/dashboard/calendar?date=${r.date}` }));

  // Searched by URL or by a word from its description before too -- title
  // alone missed both, which made a resource whose title didn't happen to
  // repeat the search term look like it wasn't in the catalogue at all.
  const courses = data.courses.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.url.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
  );
  counts.course = courses.length;
  courses.slice(0, limit).forEach((c) =>
    results.push({
      key: `c:${c.id}`,
      kind: "course",
      label: c.title || c.url || "Untitled resource",
      sub: c.url ? `Training & Resources · ${c.url}` : "Training & Resources",
      href: `/dashboard/training?q=${encodeURIComponent(c.title)}`,
    }),
  );

  return { results, counts };
}
