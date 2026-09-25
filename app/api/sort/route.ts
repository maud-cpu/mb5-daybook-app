import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { backstopFlag, FLAG_TRAINING, namesInText } from "@/lib/keywordFlags";
import { today } from "@/lib/domain";
import { BUCKETS, DAYCARE_REASONS, FlagKey, HUB_SUPPORT_TYPE_KEYS, PendingItem, REMINDER_CATEGORIES } from "@/lib/types";
import { aiErrorMessage } from "@/lib/aiErrors";

// A long, detailed note (several paragraphs covering a whole incident) needs
// the model longer to sort into several richly-filled items than Vercel's
// default serverless function timeout allows -- a real crisis entry was cut
// off mid-request and silently fell back to a plain, unflagged "Just record"
// with none of the AI sorting applied. Without this, that failure mode is
// indistinguishable from the AI just not being available.
export const maxDuration = 60;

const REMINDER_CATEGORY_KEYS = REMINDER_CATEGORIES.map(([k]) => k);

const FLAG_KEYS = [
  "sexualised",
  "disclosure",
  "injury",
  "allegation",
  "missing",
  "contact",
  "health",
  "school",
  "reminder",
] as const;

// A hand-rolled "extract the JSON array between the first [ and last ]"
// used to break completely the moment any field's text contained a
// character the model didn't escape perfectly (an email address, an
// apostrophe, a stray quote) -- one bad character anywhere in the whole
// batch lost every item's bucket/child/flag/training data, not just the
// one with the odd character. Structured outputs constrains the response
// to this exact schema server-side, so it's always valid, parseable JSON.
const SortItemSchema = z.object({
  bucket: z.string(),
  child: z.string().describe(
    "Exactly ONE name from \"kids\" below -- the main child this item is about -- or empty string if there's no single clear main one. Never more than one name, never comma-separated or joined with \"and\".",
  ),
  text: z.string(),
  kind: z.enum(["purchase", "mileage", "daycare"]).nullable(),
  amount: z.number().nullable(),
  miles: z.number().nullable(),
  // Anthropic's structured outputs cap a schema at 16 nullable/union-typed
  // parameters (a 17th returns a 400 on every request, discovered when
  // adding foodNote pushed this schema over that limit). Every string field
  // below is deliberately NOT nullable -- an empty string is a real value
  // Zod can validate directly, and the mapping below already treats an
  // empty/falsy string exactly like null everywhere it's read -- so this
  // frees up headroom for the object fields that actually need null.
  from: z.string().describe("HH:MM, or empty string if not given"),
  to: z.string().describe("HH:MM, or empty string if not given"),
  reason: z.string().describe("empty string if not given"),
  hours: z.number().nullable(),
  kids: z.array(z.string()),
  overnight: z.boolean(),
  medName: z.string().describe("empty string if not given"),
  dose: z.string().describe("empty string if not given"),
  given: z.string().describe("HH:MM, or empty string if not given"),
  givenBy: z.string().describe("empty string if not given"),
  // Testing turned up a hallucinated value here ("category or null") when
  // this was a freeform string -- harmless since the mapping below already
  // discards anything not in FLAG_KEYS, but a real enum stops it at the
  // source instead of relying on that safety net.
  flag: z.enum([...FLAG_KEYS, ""]),
  flagNote: z.string().describe("empty string if not given"),
  // Enforced as a date-only string (not just described as one) -- caught in
  // testing where a reminder for "Tuesday at 4pm" came back with the time
  // folded into this field too, which the regex check in the mapping below
  // would have silently rejected in favour of falling back to today's date.
  reminderDate: z.iso.date().nullable(),
  // Non-nullable (always some category, ignored unless flag is "reminder")
  // so this doesn't use up any of the schema's limited nullable-field
  // budget. Lets a "medical" reminder be matched up with the child's GP
  // details from About us wherever reminders are shown.
  reminderCategory: z.enum(["school", "club", "training", "surrey", "medical", "family", "household", "personal"]),
  training: z.array(z.object({ course: z.string(), why: z.string() })),
  schoolContact: z
    .object({ name: z.string(), contact: z.string() })
    .nullable()
    .describe("A specific school contact (e.g. class teacher, class rep) named in the text, with an email/phone given for them"),
  club: z
    .object({
      name: z.string(),
      // A real 400 crash was reported here: the model still wanted to
      // record a club whose name/website/provider were given but no
      // weekday was, and the strict 7-day enum gave it nothing valid to
      // put there, so it produced a value that failed schema validation
      // and lost the whole note. "Not specified" is a safe value the model
      // can always fall back to; the mapping below normalises it before it
      // ever reaches the frontend, which still only ever sees a real day.
      weekday: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Not specified"]),
      timeFrom: z.string().describe("HH:MM or empty string"),
      timeTo: z.string().describe("HH:MM or empty string"),
      provider: z.string().describe("The organisation/venue running it (person and/or place), if given, else empty string"),
      contactInfo: z.string().describe("A phone number and/or email address given for the contact, if any, else empty string"),
      cost: z.string().describe("What it costs, if given, else empty string"),
      website: z.string().describe("A website/booking link, if given, else empty string"),
      notes: z.string().describe("Any other useful detail given (what to bring, term dates, etc.), else empty string"),
    })
    .nullable()
    .describe("A child's regularly recurring extracurricular club/activity, only when the text describes it as a standing weekly thing"),
  foodNote: z
    .object({
      likes: z.string().describe("Comma-separated foods/drinks the child likes, or empty string"),
      dislikes: z.string().describe("Comma-separated foods/drinks the child dislikes, or empty string"),
    })
    .nullable()
    .describe("A specific food/drink the text says a child likes or dislikes, so it can be offered as a save to their Food box"),
  completedTraining: z
    .object({
      title: z.string().describe("A short, clear title for the training/course, tidied from the carer's own wording"),
      date: z.iso.date().nullable().describe("The date they did it, resolved against today's date; null if not stated"),
    })
    .nullable()
    .describe(
      "Set ONLY when the text says the CARER THEMSELVES has attended, done, or completed a specific named training session or course -- something already done (or being done today), not a course suggested for later -- regardless of whether it matches anything in the courses list above. Otherwise null.",
    ),
  // A single summary string rather than a structured object -- a nullable
  // object with many sub-fields (the first version of this) pushed the
  // whole schema over Anthropic's structured-output grammar-size limit,
  // breaking every capture, not just school-related ones, with a 400
  // ("compiled grammar is too large"). A plain non-nullable string costs
  // the schema almost nothing.
  schoolAdmin: z.string().describe(
    "If the text gives practical school ADMIN info -- how to pay for lunches/other school payments, a homework app/portal, a class rep, a PTA/friends-of-school group, the school office, or another useful school-related link -- a short, tidied-up summary of exactly what it says (e.g. \"ParentPay: https://... -- for lunches and other payments\"). NOT the child's day-to-day schooling, a teacher, or a one-off event. Empty string if the text doesn't give anything like that.",
  ),
  // Two flat fields rather than one nullable object, same reasoning as
  // schoolAdmin above -- keeps this cheap against the schema's size limit.
  hubCarerNames: z.string().describe(
    "Comma-separated name(s) of any Mockingbird hub carer(s) this item is about or involves -- direct contact with them (a visit, coffee, paperwork help, a call), a hub social/constellation event, or news learned via the hub about another carer's or their child's situation. E.g. \"Sophie\" or \"Sophie, Becky, Tim, Ali\". Empty string if this item isn't about hub contact/news at all.",
  ),
  hubSupportType: z
    .enum([...HUB_SUPPORT_TYPE_KEYS, ""])
    .describe(
      `Only set when hubCarerNames is non-empty: the best-fit category from ${HUB_SUPPORT_TYPE_KEYS.join(", ")} -- default "other" when nothing specific fits. Empty string when hubCarerNames is empty.`,
    ),
});
const SortResponseSchema = z.object({ items: z.array(SortItemSchema) });

function matchChild(names: string[], x: string | null | undefined): string {
  if (!x) return "";
  const v = String(x).trim().toLowerCase();
  let m = names.find((n) => n.toLowerCase() === v);
  if (m) return m;
  m = names.find((n) => n.toLowerCase().startsWith(v.slice(0, 3)) || v.startsWith(n.toLowerCase().slice(0, 3)));
  return m || "";
}

/**
 * Safety net: an item's own text often names a child the AI didn't tag
 * (or tagged only on a sibling item). Re-scanning each item's text and
 * folding in any mentioned child is what makes "Ruben had a great day...
 * Ruby had a good day too" reliably end up as two separately-tagged
 * entries rather than one or both landing with no child attached.
 */
function linkMentionedChildren(names: string[], item: PendingItem) {
  const found = namesInText(names, item.text);
  if (!found.length) return;
  const kids = new Set(item.kids);
  found.forEach((n) => kids.add(n));
  item.kids = [...kids];
  if (!item.child && item.kids.length) item.child = item.kids[0];
}

/**
 * Backstop for hub_update, same idea as linkMentionedChildren above -- the
 * carer said "basically everyone who is in our hub is hub news", so a plain
 * name match against the known roster is more reliable than trusting the
 * model's own read of whether an item "sounds like" hub contact.
 */
function linkMentionedHubMembers(hubMemberNames: string[], item: PendingItem) {
  const found = namesInText(hubMemberNames, item.text);
  if (!found.length) return;
  const existing = item.hub_update?.carer_names ? item.hub_update.carer_names.split(",").map((s) => s.trim()) : [];
  const merged = [...new Set([...existing, ...found])].filter(Boolean);
  item.hub_update = { carer_names: merged.join(", "), support_type: item.hub_update?.support_type || "other" };
}

/**
 * Used by every fallback path below (no API key, or the AI call itself
 * failing) -- these used to always save with child/kids empty, meaning a
 * note that named the very child it was about still landed completely
 * untagged if the AI couldn't be reached. A plain name search over the raw
 * text is a far better bet than nothing.
 */
function fallbackChildMatch(names: string[], text: string): { child: string; kids: string[] } {
  const kids = namesInText(names, text);
  return { child: kids[0] || "", kids };
}

function fallbackHubMatch(hubMemberNames: string[], text: string): { carer_names: string; support_type: string } | null {
  const found = namesInText(hubMemberNames, text);
  return found.length ? { carer_names: found.join(", "), support_type: "other" } : null;
}

/**
 * Everything in one capture batch is for the same day. If a child already
 * has an overnight daycare item in this batch, drop any separate
 * daytime-hours item for the same child -- the overnight rate already
 * covers the whole period, so keeping both would double-charge their care.
 */
function dropRedundantDaycare(items: PendingItem[]): PendingItem[] {
  const overnightKids = new Set(
    items.filter((p) => p.bucket === "expenses" && p.kind === "daycare" && p.overnight).flatMap((p) => p.kids),
  );
  if (!overnightKids.size) return items;
  return items.filter((p) => {
    if (!(p.bucket === "expenses" && p.kind === "daycare" && !p.overnight)) return true;
    if (!p.kids.length) return true;
    return !p.kids.every((k) => overnightKids.has(k));
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
    return NextResponse.json({ error: "No text given" }, { status: 400 });
  }

  const [{ data: children }, { data: householdChildren }, { data: hubMemberRows }] = await Promise.all([
    supabase.from("children").select("name"),
    supabase.from("household_children").select("name"),
    supabase.from("hub_members").select("name"),
  ]);
  const { data: courseRows } = await supabase
    .from("shared_training_catalog")
    .select("title, description")
    .eq("archived", false);
  // A child living in the household (household_children) is sometimes an
  // actual foster placement too, not just the carer's own/adopted/kinship
  // child -- so notes naming them should match and tag them just like the
  // main children table, instead of being flagged as an unrecognised name.
  const names = [...(children ?? []), ...(householdChildren ?? [])].map((c) => c.name as string);
  // Anyone on this list is, by definition, hub news -- a plain name match
  // (same mechanism as linkMentionedChildren below) backstops the AI's own
  // judgement call, so a known hub carer is never missed just because the
  // wording of a note didn't read as "hub contact" to the model.
  const hubMemberNames = (hubMemberRows ?? []).map((m) => m.name as string);
  const courses = (courseRows ?? []).map((c) => {
    const title = c.title as string;
    const description = (c.description as string) || "";
    return description ? `${title} (${description})` : title;
  });
  const courseTitles = new Set((courseRows ?? []).map((c) => (c.title as string).trim().toLowerCase()));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const backstop = backstopFlag(text);
    const { child, kids } = fallbackChildMatch(names, text);
    return NextResponse.json({
      items: [
        {
          bucket: "scratch",
          child,
          kids,
          also_in: [],
          text,
          kind: "purchase",
          flag: backstop.flag,
          flag_note: backstop.flagNote,
          hub_update: fallbackHubMatch(hubMemberNames, text),
        },
      ],
      warning: "AI sorting isn't set up yet (no ANTHROPIC_API_KEY) — saved as 'Just record' so nothing is lost.",
    });
  }

  const sys = `You sort a UK foster carer's spoken notes into buckets. Buckets: diary (day-to-day observations about a child), supervision (things to raise with the supervising social worker at next supervision -- including training or CPD the CARER THEMSELVES has attended, is attending, or has completed, e.g. "PDA training at Arthur and Henry's school, 2-3pm" or "did the safer caring refresher today", since that's exactly the kind of thing carers report back on at supervision, not a note about a child's own day), expenses (money spent, miles driven, or day care / babysitting provided for other carers' children), meds (a specific dose of medication given to a child), sw (log of contact with a social worker: calls, visits, what was agreed), incident (serious events needing formal reporting: injury, unexplained bruise, allegation, restraint, going missing, police), scratch (anything the carer says to "just record" or that fits nowhere).
Today's date is ${today()} -- resolve anything relative ("next Friday", "in two weeks", "the 3rd") against that, in the correct year.
Children known: ${names.join(", ") || "unknown"}. Match spoken names to these where obvious. If the carer names where something goes, obey. Otherwise choose sensibly; use scratch when unsure. Split into separate items if there are several things. Keep the carer's words, tidied for a written record, British English. Never add facts.
"kids" for each item must only be children the carer actually names or unambiguously refers to (e.g. "she"/"her" meaning the one child just named) in THAT item's own text — never add a child who isn't mentioned there, even if they're mentioned in a different item from the same note. This includes a child named possessively to identify a place or person (e.g. "at Arthur and Henry's school", "Ruby's dentist", "collecting from Jamie's club") -- naming a child that way to say where/who something involves still means they're being referred to, so put them in "kids" too, even though the sentence isn't really "about" them the way a diary entry usually is. Never drop a named child just because they're only mentioned in passing like this -- an unfamiliar name in "kids" is exactly how this app offers to add a brand new child, so a name left out here never gets asked about at all.
For expenses set "kind": "purchase" (amount in pounds), "mileage" (miles driven, one item per journey, round trip if they say so), or "daycare" (care given: from/to clock times if the carer says them, otherwise hours; kids = the child cared for, overnight true if they stayed the night). Daycare and overnight are always ONE ITEM PER CHILD, even when several children were cared for on the same occasion at the same time. Overnight is set INDIVIDUALLY per child based on what actually happened to THAT child.
For meds, set "medName", "dose", "given" (HH:MM), and "givenBy". One item per child per medicine given.
Also set "flag" on any item that needs a follow-up: one of ${FLAG_KEYS.join(", ")}, or empty string for none. Use "reminder" when the carer explicitly asks to be reminded, asks for something to be added/put on the calendar (e.g. "add parents evening to the calendar on the 12th", "put the dentist appointment in the diary for next Tuesday"), OR the item itself describes a specific future meeting, appointment or event with a date the carer would need to attend or act on (e.g. "meeting with teacher on Friday at 3pm", "dentist appointment next Tuesday", "review meeting on the 10th") — even when they didn't explicitly ask to be reminded. This also covers an existing meeting/appointment being RESCHEDULED to a new date/time (e.g. "the meeting planned for this morning has now been moved to Friday at 8.10am", "her dentist appointment has been pushed back to next Tuesday") -- set "reminderDate" (and the time, in "flagNote") to the NEW date/time it's been moved to, not the original one. Setting "reminder" here is IN ADDITION to whatever "bucket" the item belongs in (e.g. a health reason for the reschedule still makes it a "diary" item) -- never leave "reminder" off just because the item already has some other bucket. Don't use it for a date that's just mentioned in passing about something else (e.g. a birthday recalled from the past, a date something already happened), and don't use it for the REGULAR day/time of a recurring club/activity (see "club" below) -- that's handled separately and would be a duplicate. DO use "reminder" (with "reminderCategory" "club") for a one-off exception or change to that regular schedule (e.g. "just this week it's moved to Saturday instead") -- set it for the actual one-off date/time, since that's exactly the kind of specific dated change the calendar needs to reflect, in addition to recording the regular club info. Set "flagNote" to what the reminder/calendar entry should say, and "reminderDate" to the date it's for (resolve a relative date as above; if they gave no date at all, use today's date). A single one-off event or change that affects several named children together (e.g. a shared class moving to a different day, a joint appointment) is ONE reminder item with all of them in "kids" -- never split it into one item per child, unlike daycare/meds above; only give a child their own separate reminder item when the text actually describes something specific to just that child. Always set "reminderCategory" to one of school/club/training/surrey/medical/family/household/personal -- never leave it out or null, even when flag isn't "reminder": just use "personal" whenever it doesn't apply or nothing else fits. Use "medical" for a GP/dentist/hospital appointment. Never set "flag" to "training". Set a safeguarding flag both when the text describes something happening, AND when the carer is asking or wondering whether a behaviour or mark might be a sign of one of these things (e.g. "is this a sign of abuse?") — that question is itself exactly the kind of concern that needs the guidance and support surfaced, not just a literal account of abuse having occurred. Still be cautious about flagging things that are clearly unrelated.
Separately, consider whether any courses/resources from this list are relevant to what's actually going on in the text -- not just a formal skills gap, but anything whose own title or description addresses a topic, situation, or feeling that's genuinely present in the note, whether it's about the CHILD or the carer themselves. A plain diary observation still counts: e.g. a note that a child finds a specific occasion or situation stressful (a birthday, Christmas, a transition, contact) matches a resource titled about managing exactly that for that kind of family, even though the note itself is only describing the child's day, not asking for help. List (title, with what it covers in brackets where known): ${courses.join(" | ")}. Only ever pick a title that appears verbatim in this list -- never suggest a book, article, video or course that isn't in it, even if you recognise a similarly-named real one; if nothing in the list actually fits, return an empty list rather than inventing something. Set "training" to a list of every one plausibly useful (often none, sometimes more than one), each as {"course":"<the exact title only, without the bracketed description>","why":"<one short clause, specific to why THIS course over the others>"}; empty list if none.
Also separately: if the text identifies someone as a specific child's class teacher, class rep, or school office contact (e.g. "meeting with Miss Framp, she is Ruby's teacher", "her teacher, Mrs Smith"), set "schoolContact" to {"name":"<their name>","contact":"<email/phone if given, else empty string>"} tied to whichever known children that item is about, so it can be offered as a save to their records -- a name alone is enough, an email/phone is a bonus, not required. Only when the text actually establishes that relationship, not just any name mentioned near a school topic. Otherwise null.
Also separately: if the text describes a child doing a club or extracurricular activity as a standing/ongoing thing (e.g. "which she does every Monday from 5.40 to 6.20pm", "he goes swimming on Wednesdays after school", "after school club for Ruby is called Camp Glide", not a one-off outing), set "club" to {"name":"<club/activity name>","weekday":"<the REGULAR/standing day it's on, or \"Not specified\" if the text doesn't say which day>","timeFrom":"HH:MM or empty string","timeTo":"HH:MM or empty string","provider":"<who runs it and/or the venue, if given, else empty string>","contactInfo":"<a phone number and/or email given for the contact, if any, else empty string>","cost":"<what it costs, if given, else empty string>","website":"<a website/booking link, if given, else empty string>","notes":"<any other useful detail given -- what to bring, term dates, etc, else empty string>"} tied to whichever known children it's for, so it can be offered as a save to their standing clubs list -- fill in every one of those sub-fields the text actually gives, not just name/day/time, since this is meant to be a complete enough record for another carer to pick up from cold. Never guess or invent a weekday that wasn't actually said -- use "Not specified" rather than picking one, the carer can fill it in later. Otherwise null. A one-off event on a specific date, INCLUDING a one-off exception or change to a regular schedule (e.g. "just this week it's moved to Saturday instead"), is a "reminder" (with "reminderCategory" "club"), not a "club" -- set that reminder for the actual one-off date/time in addition to recording the regular "club" info, since the calendar needs to reflect the exception.
Also separately: if the text says a specific named child likes or dislikes a particular food or drink (e.g. "Rubynn doesn't like carrots", "Ruby loves pasta"), set "foodNote" to {"likes":"<comma-separated foods, or empty string>","dislikes":"<comma-separated foods, or empty string>"} tied to whichever known children it's about, so it can be offered as a save to their Food box. Only for an actual named food/drink, not a vague statement like "fussy eater" with nothing specific said. Otherwise null.
Also separately: if the text says the CARER THEMSELVES has attended, done, or completed a specific named training session or course (e.g. "did PDA training today", "completed the safer caring refresher", "PDA training at Arthur and Henry's school, 2-3pm") -- something already done or being done today, not a course being suggested for later -- set "completedTraining" to {"title":"<a short clear title, tidied from their own wording>","date":"<the date they did it, or today's date if not stated>"}, so it can be logged on their training record even when it isn't one of the courses listed above. Otherwise null.
Also separately: if the text gives practical school ADMIN info -- how to pay for school lunches or other school payments (e.g. "ParentPay is the app for school dinner money and other payments", with a link if given), a homework app/portal name or link, a class rep's name/contact, a PTA/friends-of-school group's name/contact/Facebook link, the school office's phone/email, or another useful school-related link (payment portal, newsletter, booking system, uniform shop, etc) -- set "schoolAdmin" to a short, tidied-up summary of exactly what it says, so it can be offered as a save to the relevant children's School admin notes. This is about admin/logistics, not the child's own schooling, a teacher (see "schoolContact" above), or a one-off event. Empty string if nothing like that is in the text.
Also separately: if the item is about the carer's own peer support network ("the hub", a Mockingbird constellation, or similar) -- direct contact with another carer in it (a visit, coffee together, help with paperwork, a phone call, attending something together like a meeting or review), a hub social get-together or constellation meeting, or news learned via the hub about another carer's own life or a child placed with them (a move, a health update, a placement change, a review, a family/court situation) -- set "hubCarerNames" to the name(s) of the hub carer(s) or person this is about or involves, comma-separated (e.g. "Sophie", "Sophie, Becky, Tim, Ali", "Amy"), and "hubSupportType" to the best fit from ${HUB_SUPPORT_TYPE_KEYS.join(", ")} (default "other" if nothing specific fits). If the WHOLE note opens by framing everything in it as hub news/updates (e.g. "things that have happened in the hub this week"), treat every item split out of it as hub-related this way too by default, even one that only names a child (not an adult) -- use the child's own name for "hubCarerNames" in that case, since the note is clearly still about something happening within the hub network. This is about the carer's OWN peer network generally, not a specific child's individually-assigned Mockingbird hub carer recorded elsewhere. Leave both empty only when the item plainly isn't hub-related at all (e.g. a note about the carer's own household, unconnected to the hub framing above).
Reason for day care, if said, is one of: ${DAYCARE_REASONS.join("/")}.
Split into one item per separate thing, under "items".`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      // Was 1500, then 4096 -- still too low for a long, multi-part note
      // (e.g. a whole safeguarding incident spanning several hours) that
      // splits into many richly-filled items, each with its own training
      // suggestions. A cut response is invalid JSON even mid-string, which
      // silently lost everything in the note rather than just running short.
      max_tokens: 8192,
      system: sys,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(SortResponseSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't process that note");
    if (msg.stop_reason === "max_tokens") throw new Error("That note was too long to sort in one go");
    const arr = msg.parsed_output?.items;
    if (!arr || !arr.length) throw new Error("Nothing recognised");

    const items: PendingItem[] = arr.map((p) => {
      // Belt and braces: despite the schema saying exactly one name, the AI
      // occasionally still crams more than one into "child" (e.g. "Arthur
      // and Henry") -- split it apart here rather than treating the whole
      // glob as one unmatched "name", which would show a garbled extra
      // "add child" prompt alongside the two real ones already in "kids".
      const rawChildParts = p.child
        ? String(p.child)
            .split(/\s*,\s*|\s+and\s+/i)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const rawChild = rawChildParts[0] || "";
      const rawOthers: string[] = [
        ...rawChildParts.slice(1),
        ...(Array.isArray(p.kids) ? p.kids.map((k: string) => String(k).trim()).filter(Boolean) : []),
      ];
      const rawNames = [...new Set([rawChild, ...rawOthers].filter(Boolean))];

      const child = matchChild(names, rawChild);
      const others = rawOthers.map((o) => matchChild(names, o));
      const kids = [...new Set([child, ...others].filter(Boolean))];
      const unmatched = rawNames.filter((n) => !matchChild(names, n));
      let flag: string = p.flag && (FLAG_KEYS as readonly string[]).includes(p.flag) ? p.flag : "";
      let flagNote = p.flagNote || "";
      if (!flag) {
        const backstop = backstopFlag(p.text || "");
        if (backstop.flag) {
          flag = backstop.flag;
          flagNote = backstop.flagNote;
        }
      }
      const trainingFromFlag = flag && FLAG_TRAINING[flag as FlagKey];
      // Belt and braces: drop anything the AI suggests that isn't actually
      // in the catalogue it was given, in case it names a real-sounding
      // book/course despite being told not to invent one -- a suggestion
      // like that can never have a working link anyway, so it's just
      // confusing to show. The flag-triggered recommendation below is
      // deliberately never filtered this way, since it's meant to guide
      // the carer even before the matching course has been added.
      const aiTrainingRaw: { course: string; why: string }[] = Array.isArray(p.training) ? p.training : [];
      const aiTrainingList = aiTrainingRaw.filter(
        (t) => t?.course && courseTitles.has(String(t.course).trim().toLowerCase()),
      );
      const trainingList = trainingFromFlag
        ? [trainingFromFlag, ...aiTrainingList.filter((t) => t?.course && t.course !== trainingFromFlag.course)]
        : aiTrainingList;
      const trainingNote = trainingList
        .filter((t) => t?.course && t?.why)
        .map((t) => `${t.course} — ${t.why}`)
        .join("\n");

      return {
        bucket: (BUCKETS[p.bucket as keyof typeof BUCKETS] ? p.bucket : "scratch") as PendingItem["bucket"],
        child,
        kids,
        also_in: [],
        text: p.text || "",
        kind: (p.kind && ["purchase", "mileage", "daycare"].includes(p.kind) ? p.kind : "purchase") as PendingItem["kind"],
        amount: p.amount ?? null,
        miles: p.miles ?? null,
        hours: p.hours ?? null,
        time_from: p.from || null,
        time_to: p.to || null,
        reason: p.reason || "",
        overnight: !!p.overnight,
        med_name: p.medName || "",
        dose: p.dose || "",
        given: p.given || null,
        given_by: p.givenBy || "",
        flag,
        flag_note: flagNote,
        reminder_date:
          flag === "reminder" && typeof p.reminderDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.reminderDate)
            ? p.reminderDate
            : flag === "reminder"
              ? today()
              : null,
        reminder_category:
          flag === "reminder" && REMINDER_CATEGORY_KEYS.includes(p.reminderCategory) ? p.reminderCategory : "personal",
        training_note: trainingNote,
        unmatched,
        school_contact: p.schoolContact?.name ? { name: p.schoolContact.name, contact: p.schoolContact.contact || "" } : null,
        club: p.club?.name
          ? {
              name: p.club.name,
              // "Not specified" only exists so the model always has a valid
              // value to give -- the frontend's weekday dropdown only ever
              // offers real days, so default to Monday here; it's just an
              // editable suggestion the carer confirms before saving anyway.
              weekday: p.club.weekday === "Not specified" ? "Monday" : p.club.weekday,
              timeFrom: p.club.timeFrom || "",
              timeTo: p.club.timeTo || "",
              provider: p.club.provider || "",
              contactInfo: p.club.contactInfo || "",
              cost: p.club.cost || "",
              website: p.club.website || "",
              notes: p.club.notes || "",
            }
          : null,
        food_note:
          p.foodNote && (p.foodNote.likes || p.foodNote.dislikes)
            ? { likes: p.foodNote.likes || "", dislikes: p.foodNote.dislikes || "" }
            : null,
        completed_training:
          p.completedTraining && p.completedTraining.title
            ? {
                title: p.completedTraining.title,
                date:
                  typeof p.completedTraining.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.completedTraining.date)
                    ? p.completedTraining.date
                    : today(),
              }
            : null,
        school_admin_note: p.schoolAdmin || "",
        hub_update: p.hubCarerNames?.trim()
          ? {
              carer_names: p.hubCarerNames.trim(),
              support_type: HUB_SUPPORT_TYPE_KEYS.includes(p.hubSupportType as (typeof HUB_SUPPORT_TYPE_KEYS)[number])
                ? p.hubSupportType
                : "other",
            }
          : null,
      };
    });

    items.forEach((item) => linkMentionedChildren(names, item));
    items.forEach((item) => linkMentionedHubMembers(hubMemberNames, item));
    const deduped = dropRedundantDaycare(items);

    return NextResponse.json({ items: deduped });
  } catch (e) {
    const backstop = backstopFlag(text);
    const { child, kids } = fallbackChildMatch(names, text);
    const message = aiErrorMessage(e, "That note was too long to sort in one go");
    // A raw JSON billing error is easy to miss/misread as "some AI glitch"
    // rather than what it actually is -- surfaced this exact way to a real
    // note that then also went unflagged as a calendar reminder, with no
    // obvious link between the two until the raw error text was read closely.
    const isCreditIssue = /credit balance is too low|insufficient_quota/i.test(message);
    return NextResponse.json({
      items: [
        {
          bucket: "scratch",
          child,
          kids,
          also_in: [],
          text,
          kind: "purchase",
          flag: backstop.flag,
          flag_note: backstop.flagNote,
          hub_update: fallbackHubMatch(hubMemberNames, text),
        },
      ],
      warning: isCreditIssue
        ? `Your Anthropic account has run out of credit, so nothing can be auto-sorted right now — saved as "Just record" so nothing is lost. Top up at console.anthropic.com (Plans & Billing), then come back and manually add anything this affected (like a calendar entry) since it can't be automatically re-sorted after the fact.`
        : `Couldn't sort automatically (${message}) — saved as "Just record" so nothing is lost.`,
    });
  }
}
