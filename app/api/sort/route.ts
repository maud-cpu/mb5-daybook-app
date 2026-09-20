import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { backstopFlag, FLAG_TRAINING, namesInText } from "@/lib/keywordFlags";
import { today } from "@/lib/domain";
import { BUCKETS, DAYCARE_REASONS, FlagKey, PendingItem } from "@/lib/types";

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

  const [{ data: children }, { data: householdChildren }] = await Promise.all([
    supabase.from("children").select("name"),
    supabase.from("household_children").select("name"),
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
  const courses = (courseRows ?? []).map((c) => {
    const title = c.title as string;
    const description = (c.description as string) || "";
    return description ? `${title} (${description})` : title;
  });
  const courseTitles = new Set((courseRows ?? []).map((c) => (c.title as string).trim().toLowerCase()));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const backstop = backstopFlag(text);
    return NextResponse.json({
      items: [
        { bucket: "scratch", child: "", kids: [], also_in: [], text, kind: "purchase", flag: backstop.flag, flag_note: backstop.flagNote },
      ],
      warning: "AI sorting isn't set up yet (no ANTHROPIC_API_KEY) — saved as 'Just record' so nothing is lost.",
    });
  }

  const sys = `You sort a UK foster carer's spoken notes into buckets. Buckets: diary (day-to-day observations about a child), supervision (things to raise with the supervising social worker at next supervision), expenses (money spent, miles driven, or day care / babysitting provided for other carers' children), meds (a specific dose of medication given to a child), sw (log of contact with a social worker: calls, visits, what was agreed), incident (serious events needing formal reporting: injury, unexplained bruise, allegation, restraint, going missing, police), scratch (anything the carer says to "just record" or that fits nowhere).
Today's date is ${today()} -- resolve anything relative ("next Friday", "in two weeks", "the 3rd") against that, in the correct year.
Children known: ${names.join(", ") || "unknown"}. Match spoken names to these where obvious. If the carer names where something goes, obey. Otherwise choose sensibly; use scratch when unsure. Split into separate items if there are several things. Keep the carer's words, tidied for a written record, British English. Never add facts.
"kids" for each item must only be children the carer actually names or unambiguously refers to (e.g. "she"/"her" meaning the one child just named) in THAT item's own text — never add a child who isn't mentioned there, even if they're mentioned in a different item from the same note.
For expenses set "kind": "purchase" (amount in pounds), "mileage" (miles driven, one item per journey, round trip if they say so), or "daycare" (care given: from/to clock times if the carer says them, otherwise hours; kids = the child cared for, overnight true if they stayed the night). Daycare and overnight are always ONE ITEM PER CHILD, even when several children were cared for on the same occasion at the same time. Overnight is set INDIVIDUALLY per child based on what actually happened to THAT child.
For meds, set "medName", "dose", "given" (HH:MM), and "givenBy". One item per child per medicine given.
Also set "flag" on any item that needs a follow-up: one of ${FLAG_KEYS.join(", ")}, or null. Use "reminder" only when the carer explicitly asks to be reminded — set "flagNote" to that instruction, and "reminderDate" to the date they should actually be reminded (resolve a relative date as above; if they gave no date at all, use today's date). Never set "flag" to "training". Set a safeguarding flag both when the text describes something happening, AND when the carer is asking or wondering whether a behaviour or mark might be a sign of one of these things (e.g. "is this a sign of abuse?") — that question is itself exactly the kind of concern that needs the guidance and support surfaced, not just a literal account of abuse having occurred. Still be cautious about flagging things that are clearly unrelated.
Separately, consider whether any courses from this list could help (title, with what it covers in brackets where known): ${courses.join(" | ")}. Only ever pick a title that appears verbatim in this list -- never suggest a book, article, video or course that isn't in it, even if you recognise a similarly-named real one; if nothing in the list actually fits, return an empty list rather than inventing something. Set "training" to a list of every one plausibly useful (often none, sometimes more than one), each as {"course":"<the exact title only, without the bracketed description>","why":"<one short clause, specific to why THIS course over the others>"}; empty list if none.
Reason for day care, if said, is one of: ${DAYCARE_REASONS.join("/")}.
Respond with ONLY a JSON array, no prose, no markdown: [{"bucket":"diary","child":"name or empty","text":"...","kind":"purchase|mileage|daycare|null","amount":number|null,"miles":number|null,"from":"HH:MM or null","to":"HH:MM or null","reason":"string or null","hours":number|null,"kids":["names"],"overnight":false,"medName":"string or null","dose":"string or null","given":"HH:MM or null","givenBy":"string or null","flag":"string or null","flagNote":"string or null","reminderDate":"YYYY-MM-DD or null","training":[{"course":"string","why":"string"}]}]`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: text }],
    });
    const out = msg.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const match = out.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No list in reply");
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || !arr.length) throw new Error("Nothing recognised");

    const items: PendingItem[] = arr.map((p) => {
      const rawChild = p.child ? String(p.child).trim() : "";
      const rawOthers: string[] = Array.isArray(p.kids)
        ? p.kids.map((k: string) => String(k).trim()).filter(Boolean)
        : [];
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
        bucket: BUCKETS[p.bucket as keyof typeof BUCKETS] ? p.bucket : "scratch",
        child,
        kids,
        also_in: [],
        text: p.text || "",
        kind: (["purchase", "mileage", "daycare"].includes(p.kind) ? p.kind : "purchase") as PendingItem["kind"],
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
        training_note: trainingNote,
        unmatched,
      };
    });

    items.forEach((item) => linkMentionedChildren(names, item));
    const deduped = dropRedundantDaycare(items);

    return NextResponse.json({ items: deduped });
  } catch (e) {
    const backstop = backstopFlag(text);
    return NextResponse.json({
      items: [
        {
          bucket: "scratch",
          child: "",
          kids: [],
          also_in: [],
          text,
          kind: "purchase",
          flag: backstop.flag,
          flag_note: backstop.flagNote,
        },
      ],
      warning: `Couldn't sort automatically (${e instanceof Error ? e.message : "unknown error"}) — saved as "Just record" so nothing is lost.`,
    });
  }
}
