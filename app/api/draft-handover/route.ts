import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_FIELDS, ProfileFieldKey } from "@/lib/handover";
import { pronounsFor } from "@/lib/types";
import { aiErrorMessage } from "@/lib/aiErrors";

// Structured outputs instead of hand-rolling "grab the {...} between the
// first and last brace" -- see /api/draft-diary for why that broke.
const HandoverDraftSchema = z.object(Object.fromEntries(PROFILE_FIELDS.map((f) => [f[0], z.string()])) as Record<ProfileFieldKey, z.ZodString>);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childName } = await req.json();
  if (!childName || typeof childName !== "string") {
    return NextResponse.json({ error: "No child given" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafting isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const { data: allRecords } = await supabase
    .from("records")
    .select("date, bucket, child, kids, text")
    .in("bucket", ["diary", "supervision", "meds", "sw", "incident", "scratch"])
    .order("date", { ascending: false })
    .limit(400);

  const records = (allRecords ?? []).filter((r) => r.child === childName || (r.kids || []).includes(childName));
  if (!records.length) return NextResponse.json({ error: "No entries about this child yet" }, { status: 400 });

  const src = records
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `[${r.date}] [${r.bucket}] ${r.text}`)
    .join("\n");

  // A name alone isn't a reliable signal of gender, and guessing wrong
  // misgendered a child in generated text -- use what's on file instead of
  // leaving the model to guess from the name.
  const [{ data: cRow }, { data: hhRow }] = await Promise.all([
    supabase.from("children").select("gender").eq("name", childName).maybeSingle(),
    supabase.from("household_children").select("gender").eq("name", childName).maybeSingle(),
  ]);
  const pronouns = pronounsFor(cRow?.gender || hhRow?.gender || "");
  const pronounNote = pronouns
    ? ` Use ${pronouns.subject}/${pronouns.object}/${pronouns.possessive} pronouns for ${childName}.`
    : ` ${childName}'s gender isn't recorded -- avoid guessing a pronoun from the name; use ${childName}'s name again rather than he/she/they where a pronoun would otherwise be needed.`;

  const sys = `You draft a "handover profile" for ${childName}, a child in foster care, from a UK foster carer's raw day-to-day notes -- this is a practical guide another carer would read before looking after ${childName} during a stay (a sleepover, holiday cover or similar), so it should be specific and useful at a glance, not vague.${pronounNote} Use only what is actually in the notes -- never invent a routine, preference or fact that isn't there. Write each section in plain British English, as short practical bullet points or sentences a carer could act on. Use an empty string for any section the notes say nothing useful about -- do not pad it with generic advice.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: sys,
      messages: [{ role: "user", content: src }],
      output_config: { format: zodOutputFormat(HandoverDraftSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't draft that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too long to draft in one go");
    if (!msg.parsed_output) throw new Error("Could not read the draft");
    return NextResponse.json({ sections: msg.parsed_output });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't draft: ${aiErrorMessage(e, "That was too long to draft in one go")}` },
      { status: 500 },
    );
  }
}
