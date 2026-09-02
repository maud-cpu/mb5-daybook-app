import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { DIARY_SECTIONS } from "@/lib/types";

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

  const records = (allRecords ?? []).filter(
    (r) => !childNames?.length || !r.child || childNames.includes(r.child) || (r.kids || []).some((k: string) => childNames.includes(k)),
  );

  if (!records.length) return NextResponse.json({ error: "No entries in that range" }, { status: 400 });

  const childLabel = (childNames || []).join(" & ") || "the child";
  const multiChild = (childNames || []).length > 1;
  const src = records.map((r) => `[${r.date}] [${r.bucket}]${r.child ? ` [${r.child}]` : ""} ${r.text}`).join("\n");

  const sys = `You draft a UK foster carer's weekly/monthly electronic diary for ${childLabel}${multiChild ? " (siblings covered in one diary — name which child each point is about, as in \"Ruby - you…\", and write about them together where it happened together)" : ""}, written TO the child in the second person ("You came to us…", "You loved…"), warm, plain, honest and factual, in British English, from the carer's raw notes. Group by date where helpful. Use only what is in the notes — never invent events. Anything serious (incidents, disclosures, injuries) goes in "worries" and "health" and must keep the carer's factual wording. Return ONLY JSON with keys: ${DIARY_SECTIONS.map((s) => s[0]).join(", ")}. Use an empty string for a section with nothing relevant.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2500,
      system: sys,
      messages: [{ role: "user", content: src }],
    });
    const out = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not read the draft");
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ sections: parsed });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't draft: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
