import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { decryptField, encryptField } from "@/lib/crypto";
import { readChildDocument } from "@/lib/documentContent";
import { regenerateChildLifeSummary } from "@/lib/childLifeSummary";
import { aiErrorMessage } from "@/lib/aiErrors";

// Same AI-heavy shape as /api/extract-child-doc -- one document, possibly a
// large PDF/photo, read in a single call.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { documentId, childName } = await req.json();
  if (!documentId || typeof documentId !== "string") return NextResponse.json({ error: "No document given" }, { status: 400 });

  const { data: doc, error: docError } = await supabase
    .from("child_documents")
    .select("id, child_id, title, category, file_name, file_path")
    .eq("id", documentId)
    .single();
  if (docError || !doc) return NextResponse.json({ error: "Couldn't find that document" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI summarising isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const content = await readChildDocument(supabase, doc.file_path);
  if (content.kind === "error") return NextResponse.json({ error: `Couldn't read that file: ${content.message}` }, { status: 400 });
  if (content.kind === "unsupported") {
    return NextResponse.json({ error: "Can't summarise that file type yet -- try a PDF, Word document, plain text file, or a photo." }, { status: 400 });
  }

  const label = decryptField(doc.title) || decryptField(doc.file_name) || "this document";
  const sys = `You help a UK foster carer keep track of documents on file for a child in their care (old diaries, previous placements' handover notes, meeting minutes, assessments, reports, correspondence). Write a short (2-4 sentence) plain-English summary of "${label}" -- what kind of document it is and the key things it actually says -- so the carer can tell at a glance what's in it without reopening it. If it's a diary or dated notes, mention the date range it covers. Use only what's actually written -- never invent or infer anything that isn't there. Write in plain British English, UK date order.`;

  const block = content.kind === "text" ? content.text : content.block;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: sys,
      messages: [{ role: "user", content: typeof block === "string" ? block : [block, { type: "text", text: `Summarise the document above.` }] }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error(`Could not read a summary back (stop reason: ${msg.stop_reason})`);

    await supabase
      .from("child_documents")
      .update({ summary_enc: encryptField(text), summarized_at: new Date().toISOString() })
      .eq("id", documentId);

    const lifeSummary = await regenerateChildLifeSummary(supabase, doc.child_id, childName || "this child");
    return NextResponse.json({ summary: text, lifeSummary });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't summarise that document: ${aiErrorMessage(e, "That document was too long to summarise in one go")}` },
      { status: 500 },
    );
  }
}
