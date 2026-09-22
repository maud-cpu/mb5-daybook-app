"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SearchData, SearchResult, filterSearchData, loadSearchData } from "@/lib/searchData";

const GROUPS: { kind: SearchResult["kind"]; label: string }[] = [
  { kind: "person", label: "People" },
  { kind: "entry", label: "Entries" },
  { kind: "reminder", label: "Calendar reminders" },
  { kind: "course", label: "Training & Resources" },
];

export default function SearchScreen() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadSearchData(supabase);
      if (!cancelled) {
        setSearchData(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No cap here -- this page exists specifically so a search with more
  // matches than the quick-access popover's small preview has somewhere to
  // show every one of them, not just the first handful.
  const { results } = useMemo(
    () => (searchData ? filterSearchData(searchData, query, Infinity) : { results: [] as SearchResult[] }),
    [query, searchData],
  );

  const byKind = GROUPS.map((g) => ({ ...g, items: results.filter((r) => r.kind === g.kind) })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="card">
        <h3>Search</h3>
        <input
          autoFocus
          placeholder="Search people, entries, reminders, training…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <p className="hint">Loading…</p>}
        {!loading && query.trim() && results.length === 0 && <p className="empty">Nothing found for &quot;{query.trim()}&quot;.</p>}
        {!loading && !query.trim() && <p className="hint">Type something above to search across people, entries, reminders and training.</p>}
        {!loading && results.length > 0 && (
          <p className="hint" style={{ marginTop: 8 }}>
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
      {byKind.map((g) => (
        <div className="card" key={g.kind}>
          <h3>
            {g.label} ({g.items.length})
          </h3>
          {g.items.map((r) => (
            <Link key={r.key} href={r.href} className="rec" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <b>{r.label}</b>
              <br />
              <small className="muted">{r.sub}</small>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
