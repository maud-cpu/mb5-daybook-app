import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ANNUAL_REVIEW_SECTIONS } from "@/lib/types";
import { aiErrorMessage } from "@/lib/aiErrors";

// Same structured-outputs pattern as /api/draft-diary -- see that file's
// own comment for why.
const AnnualReviewDraftSchema = z.object(
  Object.fromEntries(ANNUAL_REVIEW_SECTIONS.map(([k]) => [k, z.string()])) as Record<
    (typeof ANNUAL_REVIEW_SECTIONS)[number][0],
    z.ZodString
  >,
);

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafting isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const { data: household } = await supabase.from("household").select("annual_review_sent_at").maybeSingle();
  // Since the last review was actually sent, if there's one on record --
  // otherwise a sensible year back, since that's roughly what a review
  // covers regardless of whether this is the first one logged here.
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const dateFrom = (household?.annual_review_sent_at as string | null) || oneYearAgo.toISOString().slice(0, 10);

  const [{ data: records }, { data: completed }] = await Promise.all([
    // supervision is the carer's own training/CPD/wellbeing raised with her
    // SSW; diary/sw/incident cover the children's own achievements and
    // challenges; scratch catches anything that didn't fit elsewhere but
    // might still be worth a mention. Expenses/meds are left out -- numbers
    // and doses, not the narrative an annual review draws on.
    supabase
      .from("records")
      .select("date, bucket, child, kids, text")
      .is("deleted_at", null)
      .in("bucket", ["diary", "supervision", "sw", "incident", "scratch"])
      .gte("date", dateFrom)
      .order("date"),
    supabase.from("training_progress").select("course_title, completed_on").gte("completed_on", dateFrom).order("completed_on"),
  ]);

  const recordLines = (records ?? []).map(
    (r) => `[${r.date}] [${r.bucket}]${r.child ? ` [${r.child}]` : ""} ${r.text}`,
  );
  const trainingLines = (completed ?? []).map((c) => `[${c.completed_on}] [training completed] ${c.course_title}`);
  const src = [...recordLines, ...trainingLines].join("\n");

  if (!src.trim()) return NextResponse.json({ error: `No entries since ${dateFrom} to draft from` }, { status: 400 });

  const sys = `You draft a UK foster carer's own annual review from her raw diary/supervision/social-worker notes and completed training, covering ${dateFrom} to today. This is about HER year as a carer -- her own training, CPD, challenges and wellbeing (supervision notes are specifically about her, not the children) -- plus the children's own achievements and challenges where they reflect on the placement/her caring, written in her own voice (first person, "I", not about any one child individually the way a child's diary would be). Use only what is in the notes -- never invent an achievement, challenge, course or change that isn't actually there. For "achievements", pull together her own completed training and development plus positive outcomes for the children in her care. For "challenges", anything genuinely difficult from the notes (including incidents, if any) and what support would help. For "changes", only actual stated changes to her household or circumstances (new adult in the household, house move, work, health) -- leave as an empty string if nothing like that is mentioned, don't guess. For "training_plan", suggest sensible next steps ONLY if the notes themselves mention wanting or needing a particular course/skill -- otherwise empty string, since this is a plan she should set herself, not one to invent for her. "other" is for anything that doesn't fit the above but still seems worth a mention. Use an empty string for any section with nothing relevant -- don't pad with generic filler. Write any date the UK way (day before month) -- never the American month/day order.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: sys,
      messages: [{ role: "user", content: src }],
      output_config: { format: zodOutputFormat(AnnualReviewDraftSchema) },
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
