import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/types";

// Structured outputs instead of hand-rolling "grab the {...} between the
// first and last brace" -- see /api/draft-diary for why that broke.
const EmailDraftSchema = z.object({ subject: z.string(), body: z.string() });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { recipients, childNames, entryIds, otherNote, note, tone } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI drafting isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const { data: entries } = entryIds?.length
    ? await supabase.from("records").select("date, bucket, text").in("id", entryIds)
    : { data: [] };

  const recipientLine = (recipients || []).map((r: { label: string; name?: string }) => `${r.label}${r.name ? ` (${r.name})` : ""}`).join(", ") || "not specified";

  const sys = `You are helping a UK foster carer draft an email. Recipient(s): ${recipientLine}. This is about: ${(childNames || []).join(" and ") || "no child specified"}. Tone requested: ${tone || "warm and friendly, professional"}.
Source material — use only what's given, never invent details:
${(entries ?? []).length ? (entries ?? []).map((r: { date: string; bucket: string; text: string }) => `- ${r.date} (${BUCKETS[r.bucket as keyof typeof BUCKETS] || r.bucket}): ${r.text}`).join("\n") : "(no specific entries selected)"}
${otherNote?.trim() ? `- Also: ${otherNote.trim()}` : ""}
${note?.trim() ? `The carer's own rough note on what they want to say: "${note.trim()}"` : ""}
Write a complete, ready-to-send email in the requested tone, in British English, weaving in the source material naturally rather than listing it. Keep it warm but professional regardless of tone chosen, appropriate for someone communicating about a child in their care. Do not sign off with a name, since the carer will add their own. The body is plain text, not HTML.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system: sys,
      messages: [{ role: "user", content: "Draft the email." }],
      output_config: { format: zodOutputFormat(EmailDraftSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't draft that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too long to draft in one go");
    if (!msg.parsed_output) throw new Error("Could not read the draft");
    return NextResponse.json({ subject: msg.parsed_output.subject || "", body: (msg.parsed_output.body || "").trim() });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't draft: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
