import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_FIELDS } from "@/lib/handover";

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

  const sys = `You draft a "handover profile" for ${childName}, a child in foster care, from a UK foster carer's raw day-to-day notes -- this is a practical guide another carer would read before looking after ${childName} during a stay (a sleepover, holiday cover or similar), so it should be specific and useful at a glance, not vague. Use only what is actually in the notes -- never invent a routine, preference or fact that isn't there. Write each section in plain British English, as short practical bullet points or sentences a carer could act on. Return ONLY JSON with these keys, one string each: ${PROFILE_FIELDS.map((f) => f[0]).join(", ")}. Use an empty string for any section the notes say nothing useful about -- do not pad it with generic advice.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
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
