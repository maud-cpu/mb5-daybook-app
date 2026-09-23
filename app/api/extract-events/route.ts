import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES } from "@/lib/types";

// Structured outputs instead of hand-rolling "grab the [...] between the
// first and last bracket" -- see /api/draft-diary for why that broke. The
// category list is duplicated as a literal tuple here (z.enum needs one)
// rather than derived from REMINDER_CATEGORIES -- same as /api/sort's own
// reminderCategory field.
const EventItemSchema = z.object({
  text: z.string(),
  date: z.iso.date(),
  category: z.enum(["school", "club", "training", "surrey", "medical", "family", "household", "personal"]),
  people: z.array(z.string()),
  amount: z.number().nullable(),
  repeat: z.enum(["none", "weekly", "fortnightly", "monthly"]),
  until: z.iso.date().nullable(),
});
const EventsResponseSchema = z.object({ items: z.array(EventItemSchema) });

// Matches each name Claude returned against the household's actual people
// (case-insensitive) so it lands on the exact stored spelling -- but keeps
// a name as typed when it doesn't match anyone, since "someone else" is a
// real, legitimate case here (a friend joining a trip), not a hallucination
// to discard.
function matchNames(known: string[], arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => {
      const v = x.trim();
      return known.find((n) => n.toLowerCase() === v.toLowerCase()) || v;
    });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { text } = await req.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Paste something in first" }, { status: 400 });
  }

  const [{ data: kids }, { data: hhKids }, { data: adults }] = await Promise.all([
    supabase.from("children").select("name"),
    supabase.from("household_children").select("name"),
    supabase.from("household_adults").select("name"),
  ]);
  const childNames = [...(kids ?? []).map((c) => c.name as string), ...(hhKids ?? []).map((c) => c.name as string)];
  const adultNames = (adults ?? []).map((a) => a.name as string);
  const names = [...childNames, ...adultNames];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI extraction isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const categoryKeys = REMINDER_CATEGORIES.map(([k]) => k);

  const sys = `You read a pasted email/message (from a school, a club, a fostering agency/local authority, or anywhere else a UK foster carer gets this kind of thing) and pull out calendar-worthy items: a date to remember, something to pay and by when, an event, a deadline. Today's date is ${today()} -- resolve anything relative ("this Friday", "next Wednesday", "the 15th") against that, in the correct year. One email can contain several distinct dated things (a newsletter mentioning non-uniform day AND parents' evening AND a trip payment deadline) -- return one item per distinct thing, not one blob.
Children in this household: ${childNames.join(", ") || "none given"}. Adults in this household: ${adultNames.join(", ") || "none given"}.
Set "people" to a list of everyone the text says this specific item is actually about or involves -- could be one child, several children (e.g. a family trip involving everyone), an adult (e.g. a parents' evening), or someone else entirely who isn't in this household (spell their name as given). Use the exact names given above where they match. Empty list if the text doesn't say who it's for.
Set "category" to exactly one of: ${categoryKeys.join(", ")} -- "training" is for training/courses, "surrey" is fostering agency/social worker/local authority communications, "medical" is a health appointment, "family" is contact with birth family, "household" is general household/logistics, "personal" is anything else personal, "school" and "club" are self-explanatory.
Set "amount" to a number (pounds) only if a specific amount to pay is actually stated, else null.
Set "repeat" to "weekly", "fortnightly", or "monthly" ONLY if the text unambiguously describes an ongoing recurring thing (e.g. "swimming club runs every Tuesday"), and "until" to a sensible end date for it (e.g. end of term/year if mentioned, otherwise 3 months from the first date) in that case; otherwise "repeat" must be "none" and "until" null. Default to "none" whenever you're not sure -- a one-off mention of a date is not a recurring event.
Never invent a date that isn't stated or clearly resolvable from context. If there is nothing calendar-worthy at all, return an empty items array.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(EventsResponseSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't read that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too long to read in one go");
    const items = (msg.parsed_output?.items ?? []).map((it) => ({
      text: it.text.trim(),
      date: it.date,
      category: it.category,
      people: matchNames(names, it.people),
      amount: it.amount,
      repeat: it.repeat,
      until: it.until,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
