import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
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

const ROLEPLAY_RE = /mums? and dads?|mommies and daddies|doctors? and nurses?|being (the )?mummy and daddy/i;
const UNDRESS_RE =
  /(pulled|took off|removed|pulling|taking off)[^.!?]{0,40}(trousers|pants|underwear|knickers|clothes|pyjamas|clothing)|lay(?:ing)? on top of|climbed on top of/i;

const KEYWORD_FLAGS: { flag: FlagKey; test: (s: string) => boolean }[] = [
  {
    flag: "sexualised",
    test: (s) =>
      /sexuali[sz](?:ed|ing)|sexual(?:i[sz]ed|ly)?\s*(behaviour|behavior|play|touch(?:ing)?|comment|language|content|contact)|sexually inappropriate/i.test(
        s,
      ),
  },
  { flag: "sexualised", test: (s) => ROLEPLAY_RE.test(s) && UNDRESS_RE.test(s) },
];

const KEYWORD_TRAINING: { test: RegExp; note: string }[] = [
  {
    test: /\b(hit|hurt|kick(?:ed|ing)?|threw|throw(?:ing)?|squeez(?:ed|ing)|strangl(?:ed|ing)|hurting|cruel|cruelty|choked|stamped on|stepped on|threatened|threatening|unkind|mean|nasty|rough) *(?:to|towards|with)?\b[^.?!]{0,40}\b(dog|cat|pet|animal|rabbit|hamster|guinea pig|puppy|kitten)s?\b|\b(dog|cat|pet|animal|rabbit|hamster|guinea pig|puppy|kitten)s?\b[^.?!]{0,40}\b(hit|hurt|kick(?:ed|ing)?|threw|throw(?:ing)?|squeez(?:ed|ing)|strangl(?:ed|ing)|cruel|cruelty|choked)\b/i,
    note: "Understanding behaviour of children & young people — cruelty or aggression toward animals is a recognised sign worth exploring, not just correcting in the moment.",
  },
  {
    test: /\b(fighting|hitting|kicking|biting|scratch(?:ing)?|swearing|screaming|nasty|aggressive|violent)\b[^.?!]{0,60}\b(each other|one another|sibling|brother|sister)\b|\b(each other|one another|sibling|brother|sister)\b[^.?!]{0,60}\b(fighting|hitting|kicking|biting|scratch(?:ing)?|swearing|screaming|nasty|aggressive|violent)\b/i,
    note: "Understanding behaviour of children & young people — ongoing conflict or aggression between children in placement is worth exploring through this course and raising at supervision. De-escalation and PACE (in the Next steps list) may help too.",
  },
];

/** Safety net: catches obvious safeguarding language even if the AI call fails or misses it. */
function backstopFlag(text: string): { flag: string; flagNote: string } {
  const kf = KEYWORD_FLAGS.find((k) => k.test(text));
  if (kf) return { flag: kf.flag, flagNote: "" };
  const kt = KEYWORD_TRAINING.find((k) => k.test.test(text));
  if (kt) return { flag: "training", flagNote: kt.note };
  return { flag: "", flagNote: "" };
}

const FLAG_TRAINING: Partial<Record<FlagKey, { course: string; why: string }>> = {
  sexualised: { course: "Intro to harmful sexual behaviour (6 hrs)", why: "covers understanding and responding to this specifically." },
  disclosure: { course: "Working Together to Safeguard Children", why: "covers responding to and recording a disclosure correctly." },
  allegation: { course: "Managing allegations against adults (SCSA)", why: "covers what happens next when an allegation is made." },
  injury: { course: "Risk Management & Safer Caring", why: "covers safer care planning around unexplained injuries." },
  missing: { course: "Risk Management & Safer Caring", why: "covers safer care planning for a child going missing." },
  contact: { course: "Working with birth parents", why: "may help with the contact side of this." },
};

function matchChild(names: string[], x: string | null | undefined): string {
  if (!x) return "";
  const v = String(x).trim().toLowerCase();
  let m = names.find((n) => n.toLowerCase() === v);
  if (m) return m;
  m = names.find((n) => n.toLowerCase().startsWith(v.slice(0, 3)) || v.startsWith(n.toLowerCase().slice(0, 3)));
  return m || "";
}

function namesInText(names: string[], text: string): string[] {
  if (!text) return [];
  return names.filter((n) => new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text));
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

  const { data: children } = await supabase.from("children").select("name");
  const { data: courseRows } = await supabase
    .from("shared_training_catalog")
    .select("title")
    .eq("archived", false);
  const names = (children ?? []).map((c) => c.name as string);
  const courses = (courseRows ?? []).map((c) => c.title as string);

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
Children known: ${names.join(", ") || "unknown"}. Match spoken names to these where obvious. If the carer names where something goes, obey. Otherwise choose sensibly; use scratch when unsure. Split into separate items if there are several things. Keep the carer's words, tidied for a written record, British English. Never add facts.
For expenses set "kind": "purchase" (amount in pounds), "mileage" (miles driven, one item per journey, round trip if they say so), or "daycare" (care given: from/to clock times if the carer says them, otherwise hours; kids = the child cared for, overnight true if they stayed the night). Daycare and overnight are always ONE ITEM PER CHILD, even when several children were cared for on the same occasion at the same time. Overnight is set INDIVIDUALLY per child based on what actually happened to THAT child.
For meds, set "medName", "dose", "given" (HH:MM), and "givenBy". One item per child per medicine given.
Also set "flag" on any item that needs a follow-up: one of ${FLAG_KEYS.join(", ")}, or null. Use "reminder" only when the carer explicitly asks to be reminded — set "flagNote" to that instruction. Never set "flag" to "training". Be cautious: only set a safeguarding flag when the text actually describes that happening.
Separately, consider whether any course from this list could help: ${courses.join(" | ")}. If plausibly useful, set "training" to {"course":"<exact title>","why":"<one short clause>"}; otherwise null.
Reason for day care, if said, is one of: ${DAYCARE_REASONS.join("/")}.
Respond with ONLY a JSON array, no prose, no markdown: [{"bucket":"diary","child":"name or empty","text":"...","kind":"purchase|mileage|daycare|null","amount":number|null,"miles":number|null,"from":"HH:MM or null","to":"HH:MM or null","reason":"string or null","hours":number|null,"kids":["names"],"overnight":false,"medName":"string or null","dose":"string or null","given":"HH:MM or null","givenBy":"string or null","flag":"string or null","flagNote":"string or null","training":{"course":"string","why":"string"} or null}]`;

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
      const child = matchChild(names, p.child);
      const others = (p.others || []).map((o: string) => matchChild(names, o));
      const kids = [...new Set([child, ...others].filter(Boolean))];
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
      const trainingNote = trainingFromFlag
        ? ""
        : p.training?.course && p.training?.why
          ? `${p.training.course} — ${p.training.why}`
          : "";

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
        training_note: trainingNote,
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
