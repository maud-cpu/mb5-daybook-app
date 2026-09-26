import { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export type NameMatch = { id: string; name: string };

export type PersonTable = "household_adults" | "household_visitors" | "children" | "household_children";

// Case/whitespace-insensitive existing-row lookup, used before creating a
// new person anywhere in the app (About Us' three add forms, Hub Log's
// inline add, Capture's quick "+ Register"). The same name typed in two
// different places used to silently create two separate rows for the same
// person, with no way to tell later which one was "the real" record.
export async function findPersonByName(
  supabase: SupabaseBrowserClient,
  table: PersonTable,
  name: string,
): Promise<NameMatch | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data } = await supabase.from(table).select("id, name").ilike("name", trimmed).limit(1);
  return (data?.[0] as NameMatch | undefined) ?? null;
}

// Shared phrasing so every add-flow asks the same way, and a "no" is a
// deliberate choice to add a second, genuinely separate person of the same
// name (e.g. two different Sophies) rather than a duplicate.
export function confirmUseExisting(name: string): boolean {
  return confirm(`"${name.trim()}" is already on your list. Use that one instead of adding a new, separate entry?`);
}
