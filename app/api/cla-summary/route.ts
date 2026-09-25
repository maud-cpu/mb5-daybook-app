import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { aiErrorMessage } from "@/lib/aiErrors";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childName, sinceDate } = await req.json();
  if (!childName || typeof childName !== "string") return NextResponse.json({ error: "No child given" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI summarising isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const { data: allRecords } = await supabase
    .from("records")
    .select("id, date, bucket, kids, text, flag, flag_note, flag_done, also_in, reported, created_at")
    .order("date");
  const kidRecords = (allRecords ?? []).filter((r) => (r.kids || []).includes(childName));

  // The same groups the prep sheet counts, but here just to decide which raw
  // notes are actually worth handing to the model -- an open follow-up or
  // unreported incident matters regardless of date (a safeguarding concern
  // doesn't stop mattering because it's older than the "since" cutoff),
  // everything else is scoped to the review period. "reminder" is excluded
  // from "open follow-ups" -- it's just a calendar nudge (a club day, a
  // lunch-money reminder), not something needing following up at a CLA
  // review, and it stays "open" until its date passes rather than because
  // anyone resolved it.
  const stillRelevant = kidRecords.filter((r) => (r.flag && r.flag !== "reminder" && !r.flag_done) || (r.bucket === "incident" && !r.reported));
  const sinceScoped = kidRecords.filter(
    (r) => (r.bucket === "incident" || r.bucket === "supervision" || r.also_in.includes("supervision")) && (!sinceDate || r.date >= sinceDate),
  );
  const relevant = [...new Map([...stillRelevant, ...sinceScoped].map((r) => [r.id, r])).values()].sort((a, b) => a.date.localeCompare(b.date));

  if (!relevant.length) return NextResponse.json({ summary: "" });

  const src = relevant
    .map((r) => `[${r.date}]${r.flag ? ` [flag: ${r.flag}${r.flag_done ? ", resolved" : ", still open"}]` : ""} ${r.text}${r.flag_note ? ` -- ${r.flag_note}` : ""}`)
    .join("\n");

  const sys = `You write a short summary paragraph of ${childName}'s recent notes for a UK foster carer to read out at a Child Looked After (CLA) review meeting. 3-6 sentences, plain factual British English, third person, roughly chronological. Cover what's happened (incidents, things logged to raise) and clearly flag anything still open or unresolved that needs following up -- that's the single most important thing the meeting needs to hear. Use only what's in the notes below; never invent or assume anything. Don't pad it with pleasantries or a heading, just the summary itself.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: sys,
      messages: [{ role: "user", content: src }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't summarise that");
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) throw new Error("Could not read the summary");
    return NextResponse.json({ summary: block.text.trim() });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't summarise: ${aiErrorMessage(e, "That was too long to summarise in one go")}` }, { status: 500 });
  }
}
