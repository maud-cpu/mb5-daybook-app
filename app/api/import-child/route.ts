import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { aiErrorMessage } from "@/lib/aiErrors";

// A pasted handover/sleepover document is a completely different shape of
// input to a day-to-day Capture note -- a few hundred words of structured
// form fields, not a short observation. Forcing it through /api/sort's
// diary-note schema either produced a pile of oddly-split "diary" items or,
// for a long enough document, blew past max_tokens and got dropped to
// "Just record" with nothing actually filled in. This is a separate,
// single-purpose extraction: pull out what maps onto a child's About us
// basics directly, and keep everything else (routine, behaviour support,
// screen time, risk assessment, who to contact) as organised notes rather
// than losing it.
const ImportChildSchema = z.object({
  name: z.string().describe("The child's full name"),
  born: z.string().describe("Date of birth as YYYY-MM-DD, or empty string if not given"),
  gp: z.string().describe("GP practice name, address and phone combined into one readable line, or empty string if not given"),
  nhs: z.string().describe("NHS number, or empty string if not given"),
  allergies: z
    .string()
    .describe("Known medical conditions, allergies and current medication with dosage, combined into a short readable line, or empty string"),
  school: z.string().describe("School name and year/class combined, or empty string if not given"),
  csw: z.string().describe("The child's own social worker's name and phone number, or empty string if not given"),
  food_likes: z.string().describe("A short summary of food likes/preferences actually stated, or empty string"),
  food_dislikes: z.string().describe("A short summary of foods to avoid or dislikes actually stated, or empty string"),
  notes: z
    .string()
    .describe(
      "Everything else useful from the document that doesn't fit the fields above -- main/sleepover carer names, emergency and supervising social worker contacts, daily/bedtime routine, comfort items, emotional regulation and behaviour support, the risk-assessment answers, screen time rules, clubs/activities, family time/contact arrangements, items to pack, child's own phone number -- organised under short bold-free headings in plain text, using the document's own wording. Empty string if the document gives nothing beyond the fields above.",
    ),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { text } = await req.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "No document text given" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI reading isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const sys = `You extract a child's profile from a UK foster care handover/sleepover document, pasted in by a carer setting up a new child in their app. Use only what is actually written in the document -- never invent a name, date, contact or preference that isn't there. Where a section of the document is blank or says "N/A", leave the matching output field empty rather than guessing. Write in plain British English.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: sys,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(ImportChildSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't read that document");
    if (msg.stop_reason === "max_tokens") throw new Error("That document was too long to read in one go");
    const p = msg.parsed_output;
    if (!p || !p.name.trim()) throw new Error("Couldn't find a child's name in that document");
    return NextResponse.json({ profile: p });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't read that document: ${aiErrorMessage(e, "That document was too long to read in one go")}` },
      { status: 500 },
    );
  }
}
