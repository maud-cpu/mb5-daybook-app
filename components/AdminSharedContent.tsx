"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BANDS, Rates } from "@/lib/types";
import { AMAZON_ASSOCIATES_TAG } from "@/lib/amazon";

type RotaRow = { date: string; name: string; phone: string };
type Course = {
  id: string;
  group_key: string;
  group_label: string;
  title: string;
  how: string;
  platform: string;
  url: string;
  length: string;
  description: string;
  external_rating: number | null;
  external_rating_note: string;
  archived: boolean;
};
type Platform = { name: string; url: string };

const GROUP_LABELS: Record<string, string> = {
  pre: "Before approval (or one-off if added since)",
  once: "Mandatory — once",
  "3yr": "Mandatory — every 3 years",
  next: "Next steps (suggested)",
};

function parseRotaPaste(text: string): RotaRow[] {
  const monthMatch = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (!monthMatch) return [];
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const mon = months.indexOf(monthMatch[1].toLowerCase()) + 1;
  const yr = monthMatch[2];
  const re =
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(?:st|nd|rd|th)?[\s/|]*([A-Za-z][A-Za-z .'-]+?)[\s/|]*(0\d[\d ]{8,12})/g;
  const out: RotaRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({
      date: `${yr}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      name: m[2].trim(),
      phone: m[3].trim(),
    });
  }
  return out;
}

type ParsedResource = {
  title: string;
  extra: string;
  length: string;
  description: string;
  externalRating?: number;
  externalRatingNote?: string;
};

/**
 * Builds the same "search Amazon for this title" link the reading list
 * itself describes using. Always used to build a book's link -- the
 * pasted list only ever contains a generated search link anyway (not a
 * hand-picked product page), and a link pasted into a plain text box is
 * unreliable: a markdown link's brackets are easy to lose, or a title
 * with an apostrophe can mangle it into something worse. Rebuilding the
 * link ourselves from the title/author we've already cleanly extracted
 * sidesteps all of that.
 */
function matchesCourseSearch(c: { title: string; description: string }, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
}

function amazonSearchUrl(title: string, author: string): string {
  const q = [title, author].filter(Boolean).join(" ");
  return `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}&tag=${AMAZON_ASSOCIATES_TAG}`;
}

/**
 * Reads one bulleted "reading list" line, e.g.
 * "* The A-Z of Therapeutic Parenting — Sarah Naish  (~352 pages)  <link>"
 * -- title is everything before the first em dash, author is everything
 * after it up to the page count (or up to wherever a link starts, if
 * there's no page count). The trailing link itself is deliberately never
 * parsed out: whatever shape it's in (a markdown link, a bare URL, or a
 * mangled mix of both from a lost copy/paste), it's ignored entirely and
 * rebuilt fresh by amazonSearchUrl instead of relying on it surviving
 * intact. Returns null for anything that isn't a bulleted header line
 * (a section heading, an intro paragraph, a description or keywords line).
 */
function parseBookHeader(line: string): { title: string; author: string; pages: string } | null {
  const bulletMatch = line.match(/^[*•-]\s+(.*)$/);
  if (!bulletMatch) return null;
  const rest = bulletMatch[1];
  const dashIdx = rest.indexOf("—");
  if (dashIdx === -1) return null;
  const title = rest.slice(0, dashIdx).trim();
  const afterDash = rest.slice(dashIdx + 1).trim();
  if (!title || !afterDash) return null;

  const pagesMatch = afterDash.match(/\(~?(\d+(?:-\d+)?)(?:\s*per title)?\s*pages?\)/i);
  let author = pagesMatch ? afterDash.slice(0, pagesMatch.index) : afterDash;
  const urlIdx = author.search(/https?:\/\//);
  if (urlIdx !== -1) author = author.slice(0, urlIdx);
  author = author.replace(/[[\](){}]+$/g, "").trim();

  return { title, author, pages: pagesMatch ? pagesMatch[1] : "" };
}

function looksLikeBookList(text: string): boolean {
  return text.split("\n").some((line) => parseBookHeader(line.trim()) !== null);
}

/**
 * A reading list pasted as one book per bullet, with a short description
 * (and optionally a "Keywords: ..." line) underneath each one, and section
 * headings/intro paragraphs in between -- exactly the shape a curated book
 * list tends to come in. A blank line always separates one section from
 * the next in that shape, so it's used here to "close" whichever book was
 * last being built -- without it, a section heading or intro paragraph
 * between two books has nothing to stop it being read as more description
 * text for the book just above it. Anything before the very first
 * recognised book header is skipped rather than imported as junk; each
 * book's own description/keywords lines are folded together so the AI
 * training-matcher has real context to match against, the same as a
 * manually-written course description.
 */
function parseBookList(text: string): ParsedResource[] {
  const books: ParsedResource[] = [];
  let current: ParsedResource | null = null;
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      current = null;
      return;
    }
    const header = parseBookHeader(line);
    if (header) {
      current = {
        title: header.title,
        extra: amazonSearchUrl(header.title, header.author),
        length: header.pages ? `Book, ~${header.pages} pages` : "Book",
        description: header.author ? `By ${header.author}.` : "",
      };
      books.push(current);
      return;
    }
    if (!current) return;
    const keywordsMatch = line.match(/^keywords\s*:\s*(.+)$/i);
    const extra = keywordsMatch ? `Keywords: ${keywordsMatch[1]}` : line;
    current.description = current.description ? `${current.description} ${extra}` : extra;
  });
  return books;
}

export default function AdminSharedContent() {
  const supabase = createClient();
  const [rates, setRates] = useState<Rates | null>(null);
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [rotaPaste, setRotaPaste] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [toast, setToast] = useState("");
  const [bulkGroup, setBulkGroup] = useState("next");
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [courseTab, setCourseTab] = useState<"active" | "archived">("active");
  const [courseSearch, setCourseSearch] = useState("");

  async function load() {
    const [{ data: r }, { data: rt }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("shared_rates").select("*").single(),
      supabase.from("shared_rota").select("date, name, phone").order("date"),
      supabase.from("shared_training_catalog").select("*").order("sort_order"),
      supabase.from("shared_training_platforms").select("*"),
    ]);
    setRates(r as Rates);
    setRota((rt as RotaRow[]) ?? []);
    setCourses((c as Course[]) ?? []);
    setPlatforms((p as Platform[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  async function saveRate(patch: Partial<Rates>) {
    if (!rates) return;
    const next = { ...rates, ...patch };
    setRates(next);
    const { error } = await supabase.from("shared_rates").update(patch).eq("id", true);
    showToast(error ? "Couldn't save: " + error.message : "Rates updated — everyone sees this now");
  }

  function setBandRate(field: "day_first" | "day_add" | "overnight", band: string, value: number) {
    if (!rates) return;
    saveRate({ [field]: { ...rates[field], [band]: value } } as Partial<Rates>);
  }

  async function importRota() {
    const rows = parseRotaPaste(rotaPaste);
    if (!rows.length) {
      showToast("Couldn't find the month/year and dates in that text");
      return;
    }
    const { error } = await supabase.from("shared_rota").upsert(rows);
    if (error) showToast("Couldn't save rota: " + error.message);
    else {
      showToast(`Loaded ${rows.length} days`);
      setRotaPaste("");
      load();
    }
  }

  async function updateCourse(id: string, patch: Partial<Course>) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await supabase.from("shared_training_catalog").update(patch).eq("id", id);
    showToast("Training catalogue updated — everyone sees this now");
  }

  async function addCourse(groupKey: string) {
    const title = prompt("Course title?");
    if (!title) return;
    const { error } = await supabase
      .from("shared_training_catalog")
      .insert({ group_key: groupKey, group_label: GROUP_LABELS[groupKey], title, sort_order: 999 });
    if (error) showToast("Couldn't add: " + error.message);
    else load();
  }

  function fallbackTitleFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(last).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim() || url;
    } catch {
      return url;
    }
  }

  async function fetchTitlesFor(
    urls: string[],
  ): Promise<Record<string, { title: string; length: string; description: string }>> {
    const map: Record<string, { title: string; length: string; description: string }> = {};
    for (let i = 0; i < urls.length; i += 25) {
      const batch = urls.slice(i, i + 25);
      setBulkStatus(`Fetching titles — ${Math.min(i + 25, urls.length)} of ${urls.length}…`);
      try {
        const res = await fetch("/api/fetch-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: batch }),
        });
        const data = await res.json();
        (data.results ?? []).forEach((r: { url: string; title: string; length: string; description: string }) => {
          map[r.url] = { title: r.title, length: r.length || "", description: r.description || "" };
        });
      } catch {
        // leave this batch untitled — fallbackTitleFromUrl covers it
      }
    }
    return map;
  }

  async function bulkImportCourses(groupKey: string, text: string) {
    try {
      const isBookList = looksLikeBookList(text);
      const parsed: ParsedResource[] = isBookList
        ? parseBookList(text)
        : text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              if (line.includes("|")) {
                const [title, rest, length, rating] = line.split("|").map((s) => s.trim());
                const ratingMatch = rating ? rating.match(/^(\d+(?:\.\d+)?)/) : null;
                return {
                  title,
                  extra: rest || "",
                  length: length || "",
                  description: "",
                  externalRating: ratingMatch ? Number(ratingMatch[1]) : undefined,
                  externalRatingNote: ratingMatch ? rating : undefined,
                };
              }
              if (/^https?:\/\//i.test(line)) return { title: "", extra: line, length: "", description: "" };
              return { title: line, extra: "", length: "", description: "" };
            });
      if (!parsed.length) {
        showToast(
          isBookList
            ? "Couldn't find any books in that list — check each one has a title, an em dash, and a link like the example."
            : "Nothing to import — one per line: a title, a link, or Title | link | length",
        );
        return;
      }

      setBulkBusy(true);
      // Fetch metadata for every URL, not just ones missing a title -- a line
      // that already gives "Title | link" still benefits from an auto-pulled
      // description/length, it just keeps the title as typed. A book list
      // already carries its own length/description straight from the paste,
      // so there's nothing to fetch for those.
      const urlsToFetch = isBookList
        ? []
        : [...new Set(parsed.filter((r) => /^https?:\/\//i.test(r.extra)).map((r) => r.extra))];
      const fetched = urlsToFetch.length ? await fetchTitlesFor(urlsToFetch) : {};
      setBulkStatus("Saving…");

      const rows = parsed
        .map((r) => {
          const isUrl = /^https?:\/\//i.test(r.extra);
          const meta = isUrl ? fetched[r.extra] : undefined;
          return {
            title: r.title || meta?.title || fallbackTitleFromUrl(r.extra),
            extra: r.extra,
            length: r.length || meta?.length || "",
            description: r.description || meta?.description || "",
            externalRating: r.externalRating,
            externalRatingNote: r.externalRatingNote,
          };
        })
        .filter((r) => r.title);
      const inserts = rows.map((r, i) => {
        const isUrl = /^https?:\/\//i.test(r.extra);
        const matchedPlatform = platforms.find((p) => p.name.toLowerCase() === r.extra.toLowerCase());
        return {
          group_key: groupKey,
          group_label: GROUP_LABELS[groupKey],
          title: r.title,
          platform: matchedPlatform ? matchedPlatform.name : "",
          url: !matchedPlatform && isUrl ? r.extra : "",
          length: r.length,
          description: r.description,
          sort_order: 999 + i,
          ...(r.externalRating != null ? { external_rating: r.externalRating } : {}),
          ...(r.externalRatingNote ? { external_rating_note: r.externalRatingNote } : {}),
        };
      });
      for (let i = 0; i < inserts.length; i += 500) {
        const { error } = await supabase.from("shared_training_catalog").insert(inserts.slice(i, i + 500));
        if (error) {
          showToast(`Import stopped after ${i} of ${inserts.length}: ${error.message}`);
          setBulkBusy(false);
          setBulkStatus("");
          load();
          return;
        }
      }
      showToast(`Imported ${inserts.length} resource${inserts.length > 1 ? "s" : ""}`);
      setBulkBusy(false);
      setBulkStatus("");
      load();
    } catch (e) {
      // Belt and braces: a bulk paste should never fail completely silently --
      // if anything unexpected goes wrong, say so rather than leaving the
      // button stuck on "Saving…" with nothing to show for it.
      showToast(`Import failed: ${e instanceof Error ? e.message : "unknown error"}`);
      setBulkBusy(false);
      setBulkStatus("");
    }
  }

  async function backfillLengths() {
    // Re-checks every linked resource, not just ones with nothing at all --
    // this is how an earlier medium-only tag (e.g. "Podcast") picks up a
    // provider name once that's supported, without needing a re-import.
    // A book saved from an even earlier failed import can have its whole
    // raw pasted line -- title, author, page count and link all together
    // -- sitting in the title field itself, never split apart at all.
    // Checked first, and excluded from the other two below, so a row like
    // this is only ever repaired once rather than having a later pass
    // overwrite the fix using its still-stale title.
    const unsplitBooks = courses.filter((c) => looksUnsplit(c));
    const targets = courses.filter((c) => c.url && !looksUnsplit(c));
    // A book saved with no link at all -- typically because a markdown
    // link's href didn't survive being pasted (a browser paste into a plain
    // text box commonly keeps only the visible link text) -- gets the same
    // Amazon search link rebuilt from its own title/author instead of
    // needing the whole list re-pasted.
    const linklessBooks = courses.filter((c) => !c.url && /^Book(,|$)/.test(c.length) && !looksUnsplit(c));
    if (!targets.length && !linklessBooks.length && !unsplitBooks.length) {
      showToast("No resources have their own link to check.");
      return;
    }
    setBulkBusy(true);
    const fetched = targets.length ? await fetchTitlesFor([...new Set(targets.map((c) => c.url))]) : {};
    setBulkStatus("Saving…");
    let updated = 0;
    for (const c of unsplitBooks) {
      const header = parseBookHeader(`* ${c.title}`)!;
      const patch: Partial<Course> = {
        title: header.title,
        url: amazonSearchUrl(header.title, header.author),
        length: header.pages ? `Book, ~${header.pages} pages` : c.length || "Book",
      };
      if (!c.description && header.author) patch.description = `By ${header.author}.`;
      await supabase.from("shared_training_catalog").update(patch).eq("id", c.id);
      updated++;
    }
    for (const c of targets) {
      const patch: Partial<Course> = {};
      const length = fetched[c.url]?.length;
      if (length && length !== c.length) patch.length = length;
      // Only overwrite the title if the stored one looks broken (still has
      // a raw HTML entity in it) -- never touches a title someone typed or
      // edited themselves.
      const fetchedTitle = fetched[c.url]?.title;
      if (fetchedTitle && /&(?:#\d+|#x[0-9a-f]+|amp|apos|quot|lt|gt);/i.test(c.title) && fetchedTitle !== c.title) {
        patch.title = fetchedTitle;
      }
      // Only fills a blank description -- never overwrites one someone
      // wrote or edited themselves.
      const fetchedDescription = fetched[c.url]?.description;
      if (fetchedDescription && !c.description) patch.description = fetchedDescription;
      if (Object.keys(patch).length) {
        await supabase.from("shared_training_catalog").update(patch).eq("id", c.id);
        updated++;
      }
    }
    for (const c of linklessBooks) {
      // A book saved before this fix can have a stray link and/or page
      // count sitting as raw text inside its own description (it got
      // swallowed there instead of being recognised properly) -- strip
      // that back out of the description, then always rebuild the link
      // itself fresh from the title/author rather than trying to salvage
      // whatever's left of the original.
      const description = c.description
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\(~?\d+(?:-\d+)?(?:\s*per title)?\s*pages?\)/gi, "")
        .replace(/[[\](){}]+/g, "")
        .replace(/\s+/g, " ")
        .replace(/\s+\.?\s*$/, ".")
        .trim();
      const authorMatch = description.match(/^By (.+?)\./);
      const patch: Partial<Course> = { url: amazonSearchUrl(c.title, authorMatch ? authorMatch[1] : "") };
      if (description !== c.description) patch.description = description;
      await supabase.from("shared_training_catalog").update(patch).eq("id", c.id);
      updated++;
    }
    showToast(
      updated
        ? `Updated ${updated} of ${targets.length + linklessBooks.length + unsplitBooks.length}`
        : "Nothing new to add for any of them",
    );
    setBulkBusy(false);
    setBulkStatus("");
    load();
  }

  // A book saved from an earlier broken import can still have the whole
  // raw pasted line sitting in its title field (author, page count and
  // link never got split off), so its own title is effectively unique and
  // won't naturally match a properly-parsed copy of the same book by
  // title or link. For any row that looks like a book -- either its
  // length already says so, or its title still contains the tell-tale
  // "Title — Author (~N pages)" shape -- group by the book's own core
  // title (re-extracting it from the raw text where needed) instead of
  // by link, so a clean copy and a leftover broken copy of the same book
  // land in the same group and get deduplicated against each other.
  function bookCoreTitle(c: Course): string | null {
    const header = parseBookHeader(`* ${c.title}`);
    if (/^Book(,|$)/.test(c.length)) return (header ? header.title : c.title).trim().toLowerCase();
    if (header && header.pages) return header.title.trim().toLowerCase();
    return null;
  }

  function dedupKey(c: Course): string {
    return bookCoreTitle(c) ?? (c.url || c.title).trim().toLowerCase();
  }

  function looksUnsplit(c: Course): boolean {
    const header = parseBookHeader(`* ${c.title}`);
    return !!header && header.title.toLowerCase() !== c.title.trim().toLowerCase();
  }

  async function removeDuplicateCourses() {
    const groups = new Map<string, Course[]>();
    courses.forEach((c) => {
      const key = dedupKey(c);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    const toDelete: Course[] = [];
    groups.forEach((group) => {
      if (group.length < 2) return;
      const [, ...rest] = [...group].sort((a, b) => {
        const score = (c: Course) =>
          (c.url ? 2 : 0) + (c.length ? 1 : 0) + (/^https?:\/\//i.test(c.title) ? -5 : 0) + (looksUnsplit(c) ? -5 : 0);
        return score(b) - score(a);
      });
      toDelete.push(...rest);
    });
    if (!toDelete.length) {
      showToast("No duplicates found.");
      return;
    }
    if (!confirm(`Delete ${toDelete.length} duplicate resource${toDelete.length > 1 ? "s" : ""}? This can't be undone.`)) return;
    setBulkBusy(true);
    setBulkStatus("Removing duplicates…");
    const { error } = await supabase
      .from("shared_training_catalog")
      .delete()
      .in("id", toDelete.map((c) => c.id));
    setBulkBusy(false);
    setBulkStatus("");
    showToast(error ? "Couldn't remove duplicates: " + error.message : `Removed ${toDelete.length} duplicate${toDelete.length > 1 ? "s" : ""}`);
    load();
  }

  async function updatePlatformUrl(name: string, url: string) {
    setPlatforms((prev) => prev.map((p) => (p.name === name ? { ...p, url } : p)));
    await supabase.from("shared_training_platforms").upsert({ name, url });
  }

  if (!rates) return <p className="muted">Loading…</p>;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="card">
        <h3>Rates — {rates.label}</h3>
        <label>Label</label>
        <input value={rates.label} onChange={(e) => saveRate({ label: e.target.value })} />
        <div className="row">
          <label style={{ flex: 1 }}>
            Mileage £/mile
            <input type="number" step="0.01" value={rates.mileage} onChange={(e) => saveRate({ mileage: Number(e.target.value) })} />
          </label>
          <label style={{ flex: 1 }}>
            Miles deducted/day
            <input type="number" value={rates.daily_deduct} onChange={(e) => saveRate({ daily_deduct: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>
            Day care &lt;5hrs, first child £/hr
            <input type="number" step="0.01" value={rates.hour_first} onChange={(e) => saveRate({ hour_first: Number(e.target.value) })} />
          </label>
          <label style={{ flex: 1 }}>
            Additional child £/hr
            <input type="number" step="0.01" value={rates.hour_add} onChange={(e) => saveRate({ hour_add: Number(e.target.value) })} />
          </label>
        </div>
        <table style={{ width: "100%", marginTop: 8 }}>
          <thead>
            <tr>
              <th align="left">Band</th>
              <th align="left">Day (5+ hrs) first</th>
              <th align="left">Day (5+ hrs) additional</th>
              <th align="left">Overnight (first)</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                <td>
                  <input type="number" step="0.01" value={rates.day_first[b]} onChange={(e) => setBandRate("day_first", b, Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" step="0.01" value={rates.day_add[b]} onChange={(e) => setBandRate("day_add", b, Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" step="0.01" value={rates.overnight[b]} onChange={(e) => setBandRate("overnight", b, Number(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Changes save immediately and every carer sees them straight away.</p>
      </div>

      <div className="card">
        <h3>Out-of-hours rota</h3>
        <p className="muted">
          {rota.length} days loaded {rota.length ? `(${rota[0].date} to ${rota[rota.length - 1].date})` : ""}
        </p>
        <textarea
          rows={3}
          placeholder="Paste the whole rota document text here"
          value={rotaPaste}
          onChange={(e) => setRotaPaste(e.target.value)}
        />
        <button className="btn" onClick={importRota}>
          Load rota
        </button>
      </div>

      <div className="card">
        <h3>Training platforms</h3>
        {platforms.map((p) => (
          <div key={p.name} className="row">
            <span style={{ flex: "0 0 220px" }}>{p.name}</span>
            <input value={p.url} onChange={(e) => updatePlatformUrl(p.name, e.target.value)} placeholder="link" />
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Bulk-add resources</h3>
        <p className="note">
          Add lots at once instead of one by one. One per line — any of these work:
          <br />
          <code>Title | link or platform name</code> — you give the title
          <br />
          <code>Title | link | Video, 3 min</code> — add a rough format/length too, optional
          <br />
          <code>Title | link | Book, ~250 pages | 4.3/5 Goodreads, 950 ratings</code> — add a real external rating
          too, optional (the number at the start of that 4th part is stored as the star rating, the whole thing as
          its source note)
          <br />
          <code>https://a-bare-link-with-no-title</code> — just paste the link and it fetches the page&apos;s title
          for you automatically
          <br />
          Or paste a whole reading list — one book per bullet, e.g. <code>* Title — Author (~300 pages) [View on
          Amazon](link)</code>, with its description underneath — and it&apos;ll pull out each book, its page count,
          and its description automatically. Section headings and intro text in between are skipped.
        </p>
        <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} disabled={bulkBusy}>
          {Object.entries(GROUP_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <textarea
          rows={6}
          placeholder={"Understanding trauma | MyLearning\nhttps://youtube.com/watch?v=...\nhttps://youtube.com/watch?v=..."}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          disabled={bulkBusy}
        />
        <button
          className="btn"
          disabled={bulkBusy || !bulkText.trim()}
          onClick={() => {
            const text = bulkText;
            setBulkText("");
            bulkImportCourses(bulkGroup, text);
          }}
        >
          {bulkBusy ? bulkStatus || "Importing…" : "Import"}
        </button>
        <p className="note" style={{ marginTop: 10 }}>
          Re-checks every linked resource for its medium, best-effort duration, (for YouTube/Spotify/Vimeo) the
          channel or show name, and — if it doesn&apos;t have one yet — a description pulled from the page itself
          (e.g. the blurb shown under a Spotify episode). Also rebuilds a missing Amazon link on any book that got
          saved without one (this happens if a link&apos;s underlying address didn&apos;t survive being pasted).
          Never overwrites a description you&apos;ve written or edited yourself. Safe to re-run any time, e.g. after
          this gains a new capability.
        </p>
        <button className="chip" disabled={bulkBusy} onClick={backfillLengths}>
          {bulkBusy ? bulkStatus || "Working…" : "Update medium/length/description/links for all resources"}
        </button>{" "}
        <button className="chip" disabled={bulkBusy} onClick={removeDuplicateCourses}>
          Remove duplicate resources
        </button>
      </div>

      <div className="tabs">
        <button className={courseTab === "active" ? "on" : ""} onClick={() => setCourseTab("active")}>
          Active ({courses.filter((c) => !c.archived).length})
        </button>
        <button className={courseTab === "archived" ? "on" : ""} onClick={() => setCourseTab("archived")}>
          Archived ({courses.filter((c) => c.archived).length})
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by title or description…"
        value={courseSearch}
        onChange={(e) => setCourseSearch(e.target.value)}
        style={{ margin: "8px 0" }}
      />

      {["pre", "once", "3yr", "next"]
        .filter((g) =>
          courses.some(
            (c) =>
              c.group_key === g &&
              (courseTab === "archived" ? c.archived : !c.archived) &&
              matchesCourseSearch(c, courseSearch),
          ),
        )
        .map((g) => (
        <div className="card" key={g}>
          <h3>{GROUP_LABELS[g]}</h3>
          {courses
            .filter(
              (c) =>
                c.group_key === g &&
                (courseTab === "archived" ? c.archived : !c.archived) &&
                matchesCourseSearch(c, courseSearch),
            )
            .map((c) => (
              <div key={c.id} style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}>
                <div className="row" style={{ alignItems: "center" }}>
                  <input
                    style={{ flex: 2 }}
                    defaultValue={c.title}
                    onBlur={(e) => updateCourse(c.id, { title: e.target.value })}
                  />
                  <input
                    style={{ flex: 1 }}
                    defaultValue={c.how}
                    placeholder="Online/In person/Either"
                    onBlur={(e) => updateCourse(c.id, { how: e.target.value })}
                  />
                  <select value={c.platform} onChange={(e) => updateCourse(c.id, { platform: e.target.value })}>
                    <option value="">platform…</option>
                    {platforms.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {!c.platform && (
                    <input
                      style={{ flex: 1 }}
                      defaultValue={c.url}
                      placeholder="or paste a direct link (YouTube, TED talk, podcast…)"
                      onBlur={(e) => updateCourse(c.id, { url: e.target.value })}
                    />
                  )}
                  <input
                    style={{ flex: "0 0 130px" }}
                    defaultValue={c.length}
                    placeholder="Video, 3 min"
                    onBlur={(e) => updateCourse(c.id, { length: e.target.value })}
                  />
                  <button className="chip" onClick={() => updateCourse(c.id, { archived: !c.archived })}>
                    {c.archived ? "Unarchive" : "Archive"}
                  </button>
                </div>
                <input
                  style={{ width: "100%", marginTop: 4 }}
                  defaultValue={c.description}
                  placeholder="What it covers (optional) — helps the AI recommend it accurately; auto-filled where possible"
                  onBlur={(e) => updateCourse(c.id, { description: e.target.value })}
                />
                <div className="row" style={{ marginTop: 4 }}>
                  <input
                    style={{ flex: "0 0 90px" }}
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    defaultValue={c.external_rating ?? ""}
                    placeholder="Rating /5"
                    onBlur={(e) => updateCourse(c.id, { external_rating: e.target.value ? Number(e.target.value) : null })}
                  />
                  <input
                    style={{ flex: 1 }}
                    defaultValue={c.external_rating_note}
                    placeholder="Source, e.g. 4.6/5 on Amazon (1,200+ reviews)"
                    onBlur={(e) => updateCourse(c.id, { external_rating_note: e.target.value })}
                  />
                </div>
              </div>
            ))}
          {courseTab === "active" && (
            <button className="chip add" onClick={() => addCourse(g)}>
              + course
            </button>
          )}
        </div>
      ))}

      {courseSearch.trim() &&
        !courses.some(
          (c) => (courseTab === "archived" ? c.archived : !c.archived) && matchesCourseSearch(c, courseSearch),
        ) && (
          <div className="card">
            <p className="empty">Nothing matches &quot;{courseSearch.trim()}&quot; in {courseTab} resources.</p>
          </div>
        )}

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
