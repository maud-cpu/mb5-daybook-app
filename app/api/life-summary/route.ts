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
// likely to actually be relevant. The whole-household cap is higher since
// it's spread across everyone, not just one child.
const MAX_DOCUMENTS_SINGLE = 6;
const MAX_DOCUMENTS_HOUSEHOLD = 10;

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

  const { childId, childName, household, dateFrom, dateTo, length } = await req.json();
  const isHousehold = !!household;
  const isBrief = length === "brief";
  if (!isHousehold && (!childName || typeof childName !== "string")) {
    return NextResponse.json({ error: "No child given" }, { status: 400 });
  }
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
  const notes = (allRecords ?? []).filter(
    (r) => LIFE_BUCKETS.includes(r.bucket) && (isHousehold || (r.kids || []).includes(childName)),
  );

  // child_documents is owner-scoped by RLS, so leaving off the child_id
  // filter for a household summary still only ever returns this carer's
  // own children's documents -- just every one of them instead of one.
  let docRows: { child_id: string; title: string; file_name: string; file_path: string; category: string; uploaded_at: string }[] = [];
  let nameById: Record<string, string> = {};
  if (isHousehold) {
    const [{ data: kids }, { data: hhKids }, { data: docs }] = await Promise.all([
      supabase.from("children").select("id, name"),
      supabase.from("household_children").select("id, name"),
      supabase
        .from("child_documents")
        .select("child_id, title, file_name, file_path, category, uploaded_at")
        .order("uploaded_at", { ascending: false })
        .limit(MAX_DOCUMENTS_HOUSEHOLD),
    ]);
    nameById = Object.fromEntries([...(kids ?? []), ...(hhKids ?? [])].map((c) => [c.id, c.name]));
    docRows = docs ?? [];
  } else if (childId) {
    const { data } = await supabase
      .from("child_documents")
      .select("child_id, title, file_name, file_path, category, uploaded_at")
      .eq("child_id", childId)
      .order("uploaded_at", { ascending: false })
      .limit(MAX_DOCUMENTS_SINGLE);
    docRows = data ?? [];
  }

  const docBlocks: Anthropic.ContentBlockParam[] = [];
  let documentCount = 0;
  for (const doc of docRows) {
    const { data: blob } = await supabase.storage.from("child-documents").download(doc.file_path);
    if (!blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const who = isHousehold ? `${nameById[doc.child_id] || "Unknown child"} -- ` : "";
    const label = `${who}${doc.title || doc.file_name}${doc.category ? ` (${doc.category})` : ""}, added ${doc.uploaded_at.slice(0, 10)}`;
    const blocks = await blocksForDocument(buffer, doc.file_path, blob.type || "", label);
    if (blocks) {
      docBlocks.push(...blocks);
      documentCount++;
    }
  }

  // Checked here, after actually trying to read each document, rather than
  // on the raw row count beforehand -- a document row that exists but
  // turned out unreadable (corrupt, an unsupported type) used to still
  // count as "something to work with", sending the model a prompt that
  // pointed at documents which were never actually attached.
  if (!notes.length && !docBlocks.length) {
    return NextResponse.json({ summary: "", noteCount: 0, documentCount: 0 });
  }

  const notesText = notes
    .map((r) => {
      const who = isHousehold ? `${(r.kids || []).join(", ") || "(household)"}: ` : "";
      return `[${r.date}] (${r.bucket}) ${who}${r.text}${r.flag ? ` [flagged: ${r.flag}${r.flag_note ? ` -- ${r.flag_note}` : ""}]` : ""}${r.training_note ? ` -- ${r.training_note}` : ""}`;
    })
    .join("\n");

  const scopeLabel = isHousehold ? "the household" : childName;
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: notesText
        ? `Logged notes for ${scopeLabel} between ${dateFrom} and ${dateTo}:\n\n${notesText}`
        : `No notes were logged for ${scopeLabel} between ${dateFrom} and ${dateTo}. Use only the documents below, if any.`,
    },
    ...docBlocks,
  ];

  const householdLengthInstruction = isBrief
    ? "Exactly one sentence per child who has anything logged -- just the single most notable thing about them this period, nothing else. Leave out the closing household-wide sentence entirely unless something is genuinely significant enough to need it."
    : "A short paragraph (or just a sentence or two, if that's all there is) for each child who has anything logged, then a final short paragraph only if there's a genuine household-wide pattern worth naming (e.g. sibling conflict, a shared routine change, something affecting the whole home).";
  const singleLengthInstruction = isBrief
    ? "Around 40-70 words, 2-3 sentences -- just the single most notable thing or two from the period, not a full account of everything logged."
    : "Around 150-300 words, covering what the notes actually show: behaviour, mood, school, health, sleep, routine, contact/relationships, anything notable.";

  const sys = isHousehold
    ? `You help a UK foster carer look back at how their whole household -- every child currently in their care -- has been doing, using only their own logged notes for the period given (each note says which child or children it's about) and any documents on file for these children (which may cover a different, wider period -- treat them as background, not as things that happened during the date range itself unless they clearly say so).

Write a short, honest, factual narrative in plain British English, third person, organised child by child, using each child's name. ${householdLengthInstruction} Skip a child entirely if nothing at all was logged for them in this period rather than padding it out. No heading, no bullet points, just prose. Write any date the UK way (day before month).

Where something genuinely repeats across more than one note for the same child (e.g. disrupted sleep logged several times, a recurring behaviour, a clear mood shift), name the pattern plainly and say what it's based on (e.g. "logged three times this month"). You may gently suggest what a repeated pattern COULD mean -- framed as a possibility for the carer to think about and raise with the right person, never as a diagnosis or a certainty. You are not a clinician: never state that a pattern definitely is a sign of something. If anything reads like it could be a safeguarding concern, say so plainly and suggest raising it with that child's social worker or a health professional rather than interpreting it yourself -- even in a brief summary, never drop a genuine safeguarding concern for the sake of length.

Never invent or assume anything that isn't actually in the notes or documents. If there's too little here to say anything meaningful, say that plainly instead of padding it out.`
    : `You help a UK foster carer look back at how a specific child in their care has been doing, using only their own logged notes for the period given and any documents on file for this child (which may cover a different, wider period -- treat them as background, not as things that happened during the date range itself unless they clearly say so).

Write a short, honest, factual narrative in plain British English, third person, roughly chronological. ${singleLengthInstruction} No heading, no bullet points, just prose. Write any date the UK way (day before month).

Where something genuinely repeats across more than one note (e.g. disrupted sleep logged several times, a recurring behaviour, a clear mood shift), name the pattern plainly and say what it's based on (e.g. "logged three times this month"). You may gently suggest what a repeated pattern COULD mean -- framed as a possibility for the carer to think about and raise with the right person, never as a diagnosis or a certainty. You are not a clinician: never state that a pattern definitely is a sign of something. If anything reads like it could be a safeguarding concern, say so plainly and suggest raising it with the child's social worker or a health professional rather than interpreting it yourself -- even in a brief summary, never drop a genuine safeguarding concern for the sake of length.

Never invent or assume anything that isn't actually in the notes or documents. If there's too little here to say anything meaningful, say that plainly instead of padding it out.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      // A household summary can genuinely need to cover several children
      // in one response -- more headroom than a single child's narrative.
      // Brief still gets real headroom despite the short target length --
      // this is an output CAP, not the actual expected length, and a cap
      // too close to the target is exactly what risks truncating mid-reply.
      max_tokens: isHousehold ? (isBrief ? 1500 : 4000) : isBrief ? 600 : 1200,
      system: sys,
      messages: [{ role: "user", content }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't summarise that");
    if (msg.stop_reason === "max_tokens") throw new Error("That was too much to summarise in one go -- try a narrower date range");
    // Concatenate every text block rather than just the first -- taking
    // only the first silently dropped the rest of the response on the rare
    // response made of more than one text block, which read as "nothing
    // came back" even though the model had actually written something.
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error(`Could not read the summary (stop reason: ${msg.stop_reason})`);
    return NextResponse.json({ summary: text, noteCount: notes.length, documentCount });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't summarise: ${aiErrorMessage(e, "That was too much to summarise in one go -- try a narrower date range")}` }, { status: 500 });
  }
}
