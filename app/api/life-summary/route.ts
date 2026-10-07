import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { aiErrorMessage } from "@/lib/aiErrors";

// Same AI-heavy shape of request as /api/sort -- generous enough for several
// documents plus a wide date range of notes.
export const maxDuration = 120;

// A child's document library can grow large over time (old handovers,
// assessments, reports) -- capped so one request doesn't try to attach
// dozens of files. Most recent first, so what's included is the most
// likely to actually be relevant.
const MAX_DOCUMENTS = 6;

// Financial records (a receipt amount, a mileage claim) carry no signal
// about how a child's actually doing -- left out so they don't dilute the
// narrative with noise that isn't about the child's life at all.
const LIFE_BUCKETS = ["diary", "supervision", "meds", "sw", "incident", "scratch"];

function imageMediaType(ext: string, mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}

// Mirrors /api/extract-child-doc's per-file-type handling, but returns
// content blocks to sit alongside several OTHER documents (and the child's
// notes) in one message, rather than being the whole message on its own.
async function blocksForDocument(
  buffer: Buffer,
  path: string,
  mimeType: string,
  label: string,
): Promise<Anthropic.ContentBlockParam[] | null> {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  const imgType = imageMediaType(ext, mimeType);
  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    try {
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) return null;
      return [{ type: "text", text: `Document: ${label}\n\n${text}` }];
    } catch {
      return null;
    }
  }
  if (ext === "pdf" || mimeType === "application/pdf") {
    return [
      { type: "text", text: `Document: ${label}` },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    ];
  }
  if (imgType) {
    return [
      { type: "text", text: `Document: ${label}` },
      { type: "image", source: { type: "base64", media_type: imgType, data: buffer.toString("base64") } },
    ];
  }
  if (ext === "txt" || mimeType === "text/plain" || (!ext && !mimeType)) {
    const text = buffer.toString("utf-8");
    if (!text.trim()) return null;
    return [{ type: "text", text: `Document: ${label}\n\n${text}` }];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childId, childName, dateFrom, dateTo } = await req.json();
  if (!childName || typeof childName !== "string") return NextResponse.json({ error: "No child given" }, { status: 400 });
  if (!dateFrom || !dateTo) return NextResponse.json({ error: "Missing date range" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI summarising isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const { data: allRecords } = await supabase
    .from("records")
    .select("date, bucket, kids, text, flag, flag_note, training_note")
    .is("deleted_at", null)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date");
  const notes = (allRecords ?? []).filter((r) => LIFE_BUCKETS.includes(r.bucket) && (r.kids || []).includes(childName));

  let docRows: { title: string; file_name: string; file_path: string; category: string; uploaded_at: string }[] = [];
  if (childId) {
    const { data } = await supabase
      .from("child_documents")
      .select("title, file_name, file_path, category, uploaded_at")
      .eq("child_id", childId)
      .order("uploaded_at", { ascending: false })
      .limit(MAX_DOCUMENTS);
    docRows = data ?? [];
  }

  if (!notes.length && !docRows.length) {
    return NextResponse.json({ summary: "", noteCount: 0, documentCount: 0 });
  }

  const docBlocks: Anthropic.ContentBlockParam[] = [];
  let documentCount = 0;
  for (const doc of docRows) {
    const { data: blob } = await supabase.storage.from("child-documents").download(doc.file_path);
    if (!blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const label = `${doc.title || doc.file_name}${doc.category ? ` (${doc.category})` : ""}, added ${doc.uploaded_at.slice(0, 10)}`;
    const blocks = await blocksForDocument(buffer, doc.file_path, blob.type || "", label);
    if (blocks) {
      docBlocks.push(...blocks);
      documentCount++;
    }
  }

  const notesText = notes
    .map((r) => `[${r.date}] (${r.bucket}) ${r.text}${r.flag ? ` [flagged: ${r.flag}${r.flag_note ? ` -- ${r.flag_note}` : ""}]` : ""}${r.training_note ? ` -- ${r.training_note}` : ""}`)
    .join("\n");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: notesText
        ? `${childName}'s logged notes between ${dateFrom} and ${dateTo}:\n\n${notesText}`
        : `No notes were logged for ${childName} between ${dateFrom} and ${dateTo}. Use only the documents below, if any.`,
    },
    ...docBlocks,
  ];

  const sys = `You help a UK foster carer look back at how a specific child in their care has been doing, using only their own logged notes for the period given and any documents on file for this child (which may cover a different, wider period -- treat them as background, not as things that happened during the date range itself unless they clearly say so).

Write a short, honest, factual narrative in plain British English, third person, roughly chronological -- covering what the notes actually show: behaviour, mood, school, health, sleep, routine, contact/relationships, anything notable. Around 150-300 words, no heading, no bullet points, just prose. Write any date the UK way (day before month).

Where something genuinely repeats across more than one note (e.g. disrupted sleep logged several times, a recurring behaviour, a clear mood shift), name the pattern plainly and say what it's based on (e.g. "logged three times this month"). You may gently suggest what a repeated pattern COULD mean -- framed as a possibility for the carer to think about and raise with the right person, never as a diagnosis or a certainty. You are not a clinician: never state that a pattern definitely is a sign of something. If anything reads like it could be a safeguarding concern, say so plainly and suggest raising it with the child's social worker or a health professional rather than interpreting it yourself.

Never invent or assume anything that isn't actually in the notes or documents. If there's too little here to say anything meaningful, say that plainly instead of padding it out.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system: sys,
      messages: [{ role: "user", content }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't summarise that");
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text" || !block.text.trim()) throw new Error("Could not read the summary");
    return NextResponse.json({ summary: block.text.trim(), noteCount: notes.length, documentCount });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't summarise: ${aiErrorMessage(e, "That was too much to summarise in one go -- try a narrower date range")}` }, { status: 500 });
  }
}
