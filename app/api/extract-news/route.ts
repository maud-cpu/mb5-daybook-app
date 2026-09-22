import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/domain";

// One pasted email/WhatsApp message from Surrey or the fostering agency
// often bundles several distinct things -- a training session AND a
// general announcement AND a deadline reminder -- so this splits into one
// item per distinct thing, the same way /api/sort and /api/extract-events
// do, rather than forcing it all into one lump.
const NewsItemSchema = z.object({
  title: z.string().describe("A short headline for this item, in plain English -- not copied verbatim if the original wording is a long subject line"),
  body: z.string().describe("A clear, readable summary of what this item actually says -- tidied up, not just pasted raw text"),
  category: z.enum(["training", "announcement", "general"]).describe(
    "\"training\" for a course/session/workshop being offered, \"announcement\" for agency/Surrey news, a policy change, a deadline or a call to action, \"general\" for anything else worth sharing",
  ),
  expiresOn: z.iso.date().nullable().describe(
    "The date this stops being relevant (a session date, an application deadline, an event date) as YYYY-MM-DD, resolved against today's date given below. Null if the item isn't time-limited or no date is given.",
  ),
  url: z.string().describe("A link relevant to this item (booking page, more information, a form to fill in, a portal), if the text gives one, else empty string -- for any category, not just training"),
  trainingProvider: z.string().describe("Who is running the training (organisation and/or named person), if given, else empty string"),
  trainingCost: z.string().describe("What the training costs, if given, else empty string"),
});
const NewsResponseSchema = z.object({ items: z.array(NewsItemSchema) });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { text } = await req.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Paste something in first" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI reading isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const sys = `You read a pasted email, WhatsApp message, or announcement (from Surrey, a fostering agency, or anywhere else a foster carer gets this kind of thing) and turn it into shareable news items for every carer in the household to see. Today's date is ${today()} -- resolve any relative date ("this Friday", "by the 15th") against that, in the correct year.
Split into one item per distinct thing being announced. Write "title" and "body" in plain English, tidied up for a shared notice board -- not the raw wording of a subject line or forwarded message. Never invent information that isn't in the text.
Set "url" to any link the text actually gives for that item, whatever the category -- a booking page for training, a portal or form for an announcement, more information for anything else. Only set category "training" when the text is actually offering a specific training session, course or workshop a carer could attend or book -- fill in trainingProvider/trainingCost whenever the text gives them for that case; leave those two empty for "announcement" or "general".
If nothing in the text is actually worth sharing as a notice, return an empty items array.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: sys,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(NewsResponseSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't read that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too long to read in one go");
    const items = msg.parsed_output?.items ?? [];
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
