import { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export type NameMatch = { id: string; name: string };

export type PersonTable = "household_adults" | "household_visitors" | "children" | "household_children";

// Every one of these tables has encrypted `name` columns (see ENCRYPTION.md)
// -- a direct `.from(table).select(...).ilike("name", ...)` from the browser
// was left over from before that work and quietly stopped finding real
// matches (the try/catch below treats any failure as "no match", exactly so
// this check can never block the actual add -- which meant it was silently
// failing shut on every call instead of surfacing the problem). Several of
// the carer's own children ended up duplicated into the placement table
// this way, once per Capture "+ Register" that couldn't find them. Fetching
// through the same server routes everything else in the app already reads
// through, and matching client-side, sidesteps the direct-table access
// entirely rather than depending on it working.
const TABLE_ENDPOINT: Record<PersonTable, { path: string; key: string }> = {
  household_adults: { path: "/api/household-adults", key: "adults" },
  household_visitors: { path: "/api/household-visitors", key: "visitors" },
  children: { path: "/api/children", key: "children" },
  household_children: { path: "/api/household-children", key: "children" },
};

// Case/whitespace-insensitive existing-row lookup, used before creating a
// new person anywhere in the app (About Us' three add forms, Hub Log's
// inline add, Capture's quick "+ Register"). The same name typed in two
// different places used to silently create two separate rows for the same
// person, with no way to tell later which one was "the real" record.
export async function findPersonByName(
  _supabase: SupabaseBrowserClient,
  table: PersonTable,
  name: string,
): Promise<NameMatch | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // This check must never be able to block the actual add -- if the lookup
  // itself fails for any reason (network blip, etc.) treat it the same as
  // "no match found" rather than letting the error bubble up and abort the
  // whole add silently, which would look exactly like a broken add button.
  try {
    const { path, key } = TABLE_ENDPOINT[table];
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = await res.json();
    const rows = (data[key] as { id: string; name: string }[] | null) ?? [];
    const match = rows.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase());
    return match ? { id: match.id, name: match.name } : null;
  } catch {
    return null;
  }
}

// Shared phrasing so every add-flow asks the same way, and a "no" is a
// deliberate choice to add a second, genuinely separate person of the same
// name (e.g. two different Sophies) rather than a duplicate.
export function confirmUseExisting(name: string): boolean {
  return confirm(`"${name.trim()}" is already on your list. Use that one instead of adding a new, separate entry?`);
}

export type ChildTableMatch = NameMatch & { table: "children" | "household_children" };

// A child can legitimately be on file in either table -- a foster placement
// (children) or the carer's own/adopted/kinship child (household_children)
// -- so a form that only ever creates a row in ITS OWN table still has to
// check the OTHER one too before assuming a name is new. Checking only one
// is exactly how an already-registered child (Ruby, Rubynn) ended up with a
// second, blank "ghost" record: every add-flow that used to check just its
// own table now uses this instead.
export async function findPersonInEitherChildTable(
  supabase: SupabaseBrowserClient,
  name: string,
): Promise<ChildTableMatch | null> {
  const inChildren = await findPersonByName(supabase, "children", name);
  if (inChildren) return { ...inChildren, table: "children" };
  const inHousehold = await findPersonByName(supabase, "household_children", name);
  if (inHousehold) return { ...inHousehold, table: "household_children" };
  return null;
}
