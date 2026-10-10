import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { aiErrorMessage } from "@/lib/aiErrors";

// Backs the "Add a note & rewrite" option on the Diary and Handover boxes:
// the carer types something extra, this rewrites the box to weave it in
// alongside whatever was already there. The raw note itself is always saved
// as its own record first (by the caller, via /api/records) so it's on the
// child's actual timeline -- this route only ever touches the report text.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childLabel, label, hint, existingText, note, voice } = await req.json();
  if (!note || typeof note !== "string" || !note.trim()) return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
  if (!label || typeof label !== "string") return NextResponse.json({ error: "No box given" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafting isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const who = childLabel || "the child";
  const voiceInstructions =
    voice === "handover"
      ? `a practical handover note about ${who} for another carer to read before looking after ${who} -- specific and useful at a glance, plain British English, short practical bullet points or sentences a carer could act on`
      : voice === "annualReview"
        ? `written by the carer herself in the first person ("I"), about her own year as a foster carer -- plain, honest, factual British English, suitable for her supervising social worker to read as part of her annual review`
        : `written TO ${who} in the second person ("You came to us…"), warm, plain, honest and factual, in British English`;

  const sys = `You are updating one box of a UK foster carer's ${voice === "handover" ? "handover profile" : voice === "annualReview" ? "annual review" : "diary"}${voice === "annualReview" ? "" : ` for ${who}`}, titled "${label}"${hint ? ` (${hint})` : ""}. The carer has typed a new note to add to it. Rewrite the box's full contents ${voiceInstructions}, weaving the new note in alongside whatever was already there. Keep everything factually true to both texts -- never invent anything, never drop something already there unless the new note corrects it. If the box was empty, just write it up from the new note alone. Return only the rewritten box text and nothing else -- no heading, no preamble, no quote marks around it.${voice === "diary" ? ` This is ${who}'s own diary, which can end up being read by their birth parents or shown in court for their case -- never name any OTHER child in it, even one named in the carer's new note. Refer to another child generically instead ("a sibling", "another child in the household", "the other child") rather than by name; ${who}'s own name is fine throughout.` : ""}`;

  const existing = (existingText || "").trim();
  const userMsg = existing ? `Current box content:\n${existing}\n\nNew note to add:\n${note.trim()}` : `New note to add:\n${note.trim()}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: sys,
      messages: [{ role: "user", content: userMsg }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't rewrite that");
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) throw new Error("Could not read the rewrite");
    return NextResponse.json({ text: block.text.trim() });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't rewrite: ${aiErrorMessage(e, "That was too long to rewrite in one go")}` }, { status: 500 });
  }
}
