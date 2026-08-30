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
    return NextResponse.json({
      items: [{ bucket: "scratch", child: "", kids: [], text, kind: "purchase" }],
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
      const flag: string = p.flag && (FLAG_KEYS as readonly string[]).includes(p.flag) ? p.flag : "";
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
        flag_note: p.flagNote || "",
        training_note: trainingNote,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({
      items: [{ bucket: "scratch", child: "", kids: [], also_in: [], text, kind: "purchase" }],
      warning: `Couldn't sort automatically (${e instanceof Error ? e.message : "unknown error"}) — saved as "Just record" so nothing is lost.`,
    });
  }
}
