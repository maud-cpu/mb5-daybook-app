"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractEmail, extractPhone, today } from "@/lib/domain";
import { clubText, groupClubsByOccurrence, mondayStartWeekday } from "@/lib/calendarHelpers";
import { BUCKETS, Reminder, reminderCategoryLabel } from "@/lib/types";

const SEARCH_PAGE_SIZE = 5;

type Item = { label: string; name: string; value: string };

type SearchResult = { key: string; kind: "person" | "entry" | "reminder" | "course"; label: string; sub: string; href: string };
type SearchData = {
  people: { name: string; href: string }[];
  entries: { id: string; text: string; date: string; bucket: string }[];
  reminders: { id: string; text: string; date: string }[];
  courses: { id: string; title: string }[];
};

function normalizePhone(v: string): string {
  return v.replace(/[\s\-()]/g, "");
}

// Siblings often share the same CSW (or CSW's manager) -- when two entries
// turn out to be the same phone number, that's one person, not two lines to
// scroll past. Merge them into a single line instead of repeating the number.
function dedupePhoneItems(items: Item[]): Item[] {
  const groups = new Map<string, Item[]>();
  const order: string[] = [];
  items.forEach((it) => {
    const key = normalizePhone(it.value);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(it);
  });
  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    const first = group[0];
    const roleMatch = first.label.match(/^.*?'s (.+)$/);
    const role = roleMatch?.[1];
    if (role && group.every((g) => g.label.endsWith(`'s ${role}`))) {
      const names = group.map((g) => g.label.slice(0, g.label.length - `'s ${role}`.length));
      return { ...first, label: `${names.join(" & ")}'s ${role}` };
    }
    return { ...first, label: group.map((g) => g.label).join(" / ") };
  });
}

export default function QuickAccessButtons() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState<"phone" | "email" | "today" | "search" | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [todayItems, setTodayItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [query, setQuery] = useState("");
  const [resultLimit, setResultLimit] = useState(SEARCH_PAGE_SIZE);

  async function load(kind: "phone" | "email") {
    setLoading(true);
    const [{ data: rota }, { data: household }, { data: children }, { data: householdChildren }, { data: contacts }] = await Promise.all([
      kind === "phone" ? supabase.from("shared_rota").select("name, phone").eq("date", today()).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from("household")
        .select(
          "ssw_name, ssw_phone, ssw_email, ssw_manager_name, ssw_manager_phone, ssw_manager_email, edt, hub_leader_name, hub_leader_phone, hub_leader_email",
        )
        .maybeSingle(),
      supabase.from("children").select("name, basics"),
      supabase.from("household_children").select("name, basics"),
      supabase.from("contacts").select("label, name, phone, email"),
    ]);

    const allKids = [
      ...((children as { name: string; basics: Record<string, string> }[] | null) ?? []),
      ...((householdChildren as { name: string; basics: Record<string, string> }[] | null) ?? []),
    ];
    const out: Item[] = [];
    if (kind === "phone") {
      if (rota?.phone) out.push({ label: "Out of hours tonight", name: rota.name || "", value: rota.phone });
      if (household?.ssw_phone) out.push({ label: "SSW", name: household.ssw_name || "", value: household.ssw_phone });
      if (household?.ssw_manager_phone) out.push({ label: "SSW's manager", name: household.ssw_manager_name || "", value: household.ssw_manager_phone });
      if (household?.hub_leader_phone) out.push({ label: "Mockingbird hub leader", name: household.hub_leader_name || "", value: household.hub_leader_phone });
      const edtPhone = extractPhone(household?.edt);
      if (edtPhone) out.push({ label: "Emergency Duty Team", name: "", value: edtPhone });
      allKids.forEach((c) => {
        const p = c.basics?.csw_phone || extractPhone(c.basics?.csw);
        if (p) out.push({ label: `${c.name}'s CSW`, name: c.basics?.csw || "", value: p });
        const pm = c.basics?.cswm_phone || extractPhone(c.basics?.cswm);
        if (pm) out.push({ label: `${c.name}'s CSW's manager`, name: c.basics?.cswm || "", value: pm });
        const pi = c.basics?.iro_phone;
        if (pi) out.push({ label: `${c.name}'s IRO`, name: c.basics?.iro || "", value: pi });
      });
      (contacts as { label: string; name: string; phone: string }[] | null)
        ?.filter((c) => c.phone)
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.phone }));
    } else {
      if (household?.ssw_email) out.push({ label: "SSW", name: household.ssw_name || "", value: household.ssw_email });
      if (household?.ssw_manager_email) out.push({ label: "SSW's manager", name: household.ssw_manager_name || "", value: household.ssw_manager_email });
      if (household?.hub_leader_email) out.push({ label: "Mockingbird hub leader", name: household.hub_leader_name || "", value: household.hub_leader_email });
      allKids.forEach((c) => {
        const e = c.basics?.csw_email || extractEmail(c.basics?.csw);
        if (e) out.push({ label: `${c.name}'s CSW`, name: c.basics?.csw || "", value: e });
        const em = c.basics?.cswm_email || extractEmail(c.basics?.cswm);
        if (em) out.push({ label: `${c.name}'s CSW's manager`, name: c.basics?.cswm || "", value: em });
        const ei = c.basics?.iro_email;
        if (ei) out.push({ label: `${c.name}'s IRO`, name: c.basics?.iro || "", value: ei });
      });
      const seen = new Set(out.map((o) => o.value.toLowerCase()));
      (contacts as { label: string; name: string; email: string }[] | null)
        ?.filter((c) => c.email && !seen.has(c.email.toLowerCase()))
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.email }));
    }
    setItems(kind === "phone" ? dedupePhoneItems(out) : out);
    setLoading(false);
  }

  function togglePhone() {
    if (open === "phone") {
      setOpen(null);
      return;
    }
    setOpen("phone");
    load("phone");
  }

  function openEmail() {
    setOpen(null);
    router.push("/dashboard/entries?compose=1");
  }

  async function toggleToday() {
    if (open === "today") {
      setOpen(null);
      return;
    }
    setOpen("today");
    setLoading(true);
    const [{ data }, { data: clubs }, { data: kids }, { data: hhKids }] = await Promise.all([
      supabase.from("reminders").select("*").eq("done", false).eq("date", today()),
      supabase.from("child_clubs").select("id, child_id, club_name, weekday, time_from, time_to"),
      supabase.from("children").select("id, name"),
      supabase.from("household_children").select("id, name"),
    ]);
    const childNameById: Record<string, string> = {};
    ((kids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    ((hhKids as { id: string; name: string }[] | null) ?? []).forEach((c) => (childNameById[c.id] = c.name));
    const todayWeekday = mondayStartWeekday(today());
    const clubRows = (clubs as { id: string; child_id: string; club_name: string; weekday: number; time_from: string; time_to: string }[] | null) ?? [];
    const clubItems: Reminder[] = groupClubsByOccurrence(clubRows, childNameById)
      .filter((c) => c.weekday === todayWeekday)
      .map((c) => ({
        id: `club:${c.id}`,
        text: clubText(c.club_name, c.time_from, c.time_to),
        date: today(),
        done: false,
        done_at: null,
        category: "club",
        child: "",
        people: c.childNames,
        amount: null,
        series_id: null,
        source_text: "",
      }));
    setTodayItems([...((data as Reminder[]) ?? []), ...clubItems]);
    setLoading(false);
  }

  // Loaded once when the search panel first opens, then filtered entirely
  // client-side as she types -- a single foster household's data is small
  // enough that this stays instant, and it avoids a network round-trip on
  // every keystroke.
  async function loadSearch() {
    setLoading(true);
    const [{ data: kids }, { data: hhKids }, { data: records }, { data: reminders }, { data: courses }] = await Promise.all([
      supabase.from("children").select("name"),
      supabase.from("household_children").select("name"),
      supabase.from("records").select("id, bucket, text, date").order("date", { ascending: false }).limit(500),
      supabase.from("reminders").select("id, text, date").eq("done", false),
      supabase.from("shared_training_catalog").select("id, title").eq("archived", false),
    ]);
    setSearchData({
      people: [
        ...((kids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, href: `/dashboard/about?person=${encodeURIComponent(c.name)}` })),
        ...((hhKids as { name: string }[] | null) ?? []).map((c) => ({ name: c.name, href: `/dashboard/about?person=${encodeURIComponent(c.name)}` })),
      ],
      entries: (records as { id: string; bucket: string; text: string; date: string }[] | null) ?? [],
      reminders: (reminders as { id: string; text: string; date: string }[] | null) ?? [],
      courses: (courses as { id: string; title: string }[] | null) ?? [],
    });
    setLoading(false);
  }

  function toggleSearch() {
    if (open === "search") {
      setOpen(null);
      return;
    }
    setOpen("search");
    setQuery("");
    setResultLimit(SEARCH_PAGE_SIZE);
    if (!searchData) loadSearch();
  }

  function onSearchChange(v: string) {
    setQuery(v);
    setResultLimit(SEARCH_PAGE_SIZE);
  }

  const { results, hasMore } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchData) return { results: [] as SearchResult[], hasMore: false };
    const out: SearchResult[] = [];
    let more = false;
    const cap = <T,>(matches: T[]) => {
      if (matches.length > resultLimit) more = true;
      return matches.slice(0, resultLimit);
    };
    cap(searchData.people.filter((p) => p.name.toLowerCase().includes(q))).forEach((p) =>
      out.push({ key: `p:${p.name}`, kind: "person", label: p.name, sub: "Person", href: p.href }),
    );
    cap(searchData.entries.filter((e) => e.text.toLowerCase().includes(q))).forEach((e) =>
      out.push({
        key: `e:${e.id}`,
        kind: "entry",
        label: e.text.length > 70 ? e.text.slice(0, 70) + "…" : e.text,
        sub: `${BUCKETS[e.bucket as keyof typeof BUCKETS] || e.bucket} · ${e.date}`,
        href: `/dashboard/entries?edit=${e.id}`,
      }),
    );
    cap(searchData.reminders.filter((r) => r.text.toLowerCase().includes(q))).forEach((r) =>
      out.push({ key: `r:${r.id}`, kind: "reminder", label: r.text, sub: `Calendar · ${r.date}`, href: `/dashboard/calendar?date=${r.date}` }),
    );
    cap(searchData.courses.filter((c) => c.title.toLowerCase().includes(q))).forEach((c) =>
      out.push({ key: `c:${c.id}`, kind: "course", label: c.title, sub: "Training & Resources", href: `/dashboard/training?q=${encodeURIComponent(c.title)}` }),
    );
    return { results: out, hasMore: more };
  }, [query, searchData, resultLimit]);

  return (
    <div>
      <div id="qaBtns">
        <button onClick={togglePhone} title="Important numbers">
          📞
        </button>
        <button onClick={openEmail} title="Compose an email">
          ✉️
        </button>
        <button onClick={toggleToday} title="What's happening today">
          📅
        </button>
        <button onClick={toggleSearch} title="Search everything">
          🔍
        </button>
      </div>
      {open === "search" && (
        <div id="qaPanel" className="show">
          <input
            autoFocus
            placeholder="Search people, entries, reminders, training…"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {loading && <p className="hint">Loading…</p>}
          {!loading && query.trim() && results.length === 0 && <p className="empty">Nothing found.</p>}
          {!loading &&
            results.map((r) => (
              <Link key={r.key} href={r.href} className="qi" style={{ display: "block", textDecoration: "none", color: "inherit" }} onClick={() => setOpen(null)}>
                <b>{r.label}</b>
                <br />
                <small className="muted">{r.sub}</small>
              </Link>
            ))}
          {!loading && hasMore && (
            <button className="chip" style={{ marginTop: 8, width: "100%" }} onClick={() => setResultLimit((n) => n + SEARCH_PAGE_SIZE * 2)}>
              Show more results
            </button>
          )}
        </div>
      )}
      {open === "today" && (
        <div id="qaPanel" className="show">
          {loading && <p className="hint">Loading…</p>}
          {!loading && todayItems.length === 0 && <p className="empty">Nothing on the calendar today.</p>}
          {!loading &&
            todayItems.map((r) => (
              <div className="qi" key={r.id}>
                <b>{reminderCategoryLabel(r.category)}</b> {r.text}
                {r.people.length ? ` · ${r.people.join(", ")}` : ""}
                {r.amount != null ? ` · £${Number(r.amount).toFixed(2)}` : ""}
              </div>
            ))}
        </div>
      )}
      {open === "phone" && (
        <div id="qaPanel" className="show">
          {loading && <p className="hint">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="empty">Nothing set yet — add SSW / CSW details in About us.</p>
          )}
          {!loading &&
            items.map((it, i) => (
              <div className="qi" key={i}>
                <b>{it.label}</b>
                {it.name ? " — " + it.name : ""}
                <br />
                <a href={`tel:${it.value}`}>{it.value}</a>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
