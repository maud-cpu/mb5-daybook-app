import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/domain";

function matchChild(names: string[], x: string | null | undefined): string {
  if (!x) return "";
  const v = String(x).trim().toLowerCase();
  const m = names.find((n) => n.toLowerCase() === v);
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
    return NextResponse.json({ error: "Paste something in first" }, { status: 400 });
  }

  const [{ data: kids }, { data: hhKids }] = await Promise.all([
    supabase.from("children").select("name"),
    supabase.from("household_children").select("name"),
  ]);
  const names = [...(kids ?? []).map((c) => c.name as string), ...(hhKids ?? []).map((c) => c.name as string)];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI extraction isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const sys = `You read a pasted email/message (from a school, a club, a fostering agency/local authority, or anywhere else a UK foster carer gets this kind of thing) and pull out calendar-worthy items: a date to remember, something to pay and by when, an event, a deadline. Today's date is ${today()} -- resolve anything relative ("this Friday", "next Wednesday", "the 15th") against that, in the correct year. One email can contain several distinct dated things (a newsletter mentioning non-uniform day AND parents' evening AND a trip payment deadline) -- return one item per distinct thing, not one blob.
Children in this household: ${names.join(", ") || "none given"}. Set "child" to one of these EXACTLY if the text is clearly about them, else empty string -- never invent or guess a child who isn't named.
Set "category" to exactly one of: "school", "club", "surrey" (fostering agency/social worker/local authority communications), "personal".
Set "amount" to a number (pounds) only if a specific amount to pay is actually stated, else null.
Set "repeat" to "weekly", "fortnightly", or "monthly" ONLY if the text unambiguously describes an ongoing recurring thing (e.g. "swimming club runs every Tuesday"), and "until" to a sensible end date for it (e.g. end of term/year if mentioned, otherwise 3 months from the first date) in that case; otherwise "repeat" must be "none" and "until" null. Default to "none" whenever you're not sure -- a one-off mention of a date is not a recurring event.
Never invent a date that isn't stated or clearly resolvable from context. If there is nothing calendar-worthy at all, return an empty array.
Respond with ONLY a JSON array, no prose, no markdown: [{"text":"short description","date":"YYYY-MM-DD","category":"school|club|surrey|personal","child":"name or empty","amount":number|null,"repeat":"none|weekly|fortnightly|monthly","until":"YYYY-MM-DD or null"}]`;

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
    if (!match) throw new Error("Could not read the extracted items");
    const parsed = JSON.parse(match[0]);
    const items = (Array.isArray(parsed) ? parsed : [])
      .filter((it) => it && typeof it.text === "string" && typeof it.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.date))
      .map((it) => ({
        text: String(it.text).trim(),
        date: it.date,
        category: ["school", "club", "surrey", "personal"].includes(it.category) ? it.category : "personal",
        child: matchChild(names, it.child),
        amount: typeof it.amount === "number" ? it.amount : null,
        repeat: ["weekly", "fortnightly", "monthly"].includes(it.repeat) ? it.repeat : "none",
        until: typeof it.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.until) ? it.until : null,
      }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
