import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DIARY_SECTIONS } from "@/lib/types";
import { aiErrorMessage } from "@/lib/aiErrors";

// Was a hand-rolled "grab the {...} between the first and last brace" --
// the exact fragile pattern /api/sort and others moved away from earlier,
// since a stray unescaped character (or the model wrapping its answer in a
// sentence or a markdown fence) loses the whole draft with no way to tell
// why. Structured outputs constrains the response to this exact schema
// server-side instead, so it's always valid, parseable JSON.
const DiaryDraftSchema = z.object(Object.fromEntries(DIARY_SECTIONS.map(([k]) => [k, z.string()])) as Record<(typeof DIARY_SECTIONS)[number][0], z.ZodString>);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childNames, dateFrom, dateTo } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafting isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  let query = supabase
    .from("records")
    .select("date, bucket, child, kids, text")
    .in("bucket", ["diary", "sw", "incident", "supervision"])
    .order("date");
  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  const { data: allRecords } = await query;

  const records = (allRecords ?? []).filter((r) => {
    const namesThisChild = (childNames?.length && childNames.includes(r.child)) || (r.kids || []).some((k: string) => childNames?.includes(k));
    if (namesThisChild) return true;
    // A supervision note with no child named is about the CARER (her own
    // training, CPD, wellbeing to raise with her SSW) -- never diary content
    // for a child, so unlike the other buckets it should never fall through
    // just because no specific child happened to be tagged on it.
    if (r.bucket === "supervision") return false;
    return !childNames?.length || !r.child;
  });

  if (!records.length) return NextResponse.json({ error: "No entries in that range" }, { status: 400 });

  const childLabel = (childNames || []).join(" & ") || "the child";
  const multiChild = (childNames || []).length > 1;
  const src = records.map((r) => `[${r.date}] [${r.bucket}]${r.child ? ` [${r.child}]` : ""} ${r.text}`).join("\n");

  const sys = `You draft a UK foster carer's weekly/monthly electronic diary for ${childLabel}${multiChild ? " (siblings covered in one diary — name which child each point is about, as in \"Ruby - you…\", and write about them together where it happened together)" : ""}, written TO the child in the second person ("You came to us…", "You loved…"), warm, plain, honest and factual, in British English, from the carer's raw notes. Group by date where helpful. Use only what is in the notes — never invent events. Anything serious (incidents, disclosures, injuries) goes in "worries" and "health" and must keep the carer's factual wording. This diary is about ${childLabel} only -- skip any note that is really about the CARER herself (her own training, CPD, or wellbeing) rather than something that happened to or with ${childLabel}, even if it's in the notes given to you. Use an empty string for a section with nothing relevant.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: sys,
      messages: [{ role: "user", content: src }],
      output_config: { format: zodOutputFormat(DiaryDraftSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't draft that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too long to draft in one go");
    if (!msg.parsed_output) throw new Error("Could not read the draft");
    return NextResponse.json({ sections: msg.parsed_output });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't draft: ${aiErrorMessage(e, "That was too long to draft in one go — try a shorter date range")}` },
      { status: 500 },
    );
  }
}
