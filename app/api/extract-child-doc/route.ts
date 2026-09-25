import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { BASICS_SECTIONS } from "@/lib/basics";
import { aiErrorMessage } from "@/lib/aiErrors";

export const maxDuration = 60;

// Plain free-text basics fields only -- no dates (an uploaded document
// rarely states a precise "next due" date worth trusting blind, and a
// wrong one would silently overwrite a real reminder), no repeatable
// lists or checklists (need their own JSON shape, not a plain string) and
// no dropdown-backed fields like legal status (a value that doesn't match
// one of the dropdown's exact options would just show as blank in the UI
// despite being saved). Everything here is a free-text box, so whatever
// the model extracts is always safe to drop straight in.
const EXTRACT_KEYS = [
  "la",
  "csw",
  "csw_phone",
  "csw_email",
  "cswm",
  "cswm_phone",
  "cswm_email",
  "iro",
  "iro_phone",
  "iro_email",
  "duty",
  "gp",
  "nhs",
  "allergies",
  "dentist",
  "food_preference",
  "food_likes",
  "food_dislikes",
  "school",
  "pep",
  "send",
  "contact",
  "nocontact",
  "family",
  "cc_contact",
  "cc_phone",
  "notes",
] as const;

function fieldMeta(key: string) {
  for (const section of BASICS_SECTIONS) {
    const field = section.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

const ExtractSchema = z.object(
  Object.fromEntries(
    EXTRACT_KEYS.map((key) => {
      const field = fieldMeta(key);
      const desc = [field?.label, field?.placeholder].filter(Boolean).join(" -- ");
      return [key, z.string().describe(desc || key)];
    }),
  ) as Record<(typeof EXTRACT_KEYS)[number], z.ZodString>,
);

function imageMediaType(ext: string, mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { path } = await req.json();
  if (!path || typeof path !== "string") return NextResponse.json({ error: "No document given" }, { status: 400 });

  const { data: blob, error: downloadError } = await supabase.storage.from("child-documents").download(path);
  if (downloadError || !blob) {
    return NextResponse.json({ error: "Couldn't read that file: " + (downloadError?.message || "not found") }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI reading isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  const mimeType = blob.type || "";

  let content: string | Anthropic.ContentBlockParam[];
  const imgType = imageMediaType(ext, mimeType);
  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    try {
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) return NextResponse.json({ error: "Couldn't find any text in that Word document" }, { status: 400 });
      content = text;
    } catch {
      return NextResponse.json({ error: "Couldn't read that as a Word document" }, { status: 400 });
    }
  } else if (ext === "pdf" || mimeType === "application/pdf") {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
      { type: "text", text: "Extract this child's profile information from the document above." },
    ];
  } else if (imgType) {
    content = [
      { type: "image", source: { type: "base64", media_type: imgType, data: buffer.toString("base64") } },
      { type: "text", text: "Extract this child's profile information from the photo above." },
    ];
  } else if (ext === "txt" || mimeType === "text/plain" || (!ext && !mimeType)) {
    const text = buffer.toString("utf-8");
    if (!text.trim()) return NextResponse.json({ error: "Couldn't find any readable text in that file" }, { status: 400 });
    content = text;
  } else {
    return NextResponse.json(
      { error: "Can't read that file type yet -- try a PDF, Word document, plain text file, or a photo of the document." },
      { status: 400 },
    );
  }

  const sys = `You extract information about a child in UK foster care from a document a carer has on file (an old handover, meeting notes, an assessment, a report, correspondence). Use only what is actually written -- never invent or infer a contact, number or preference that isn't there. Leave a field as an empty string if the document doesn't give it. Write in plain British English, combining a name/number/address for the same thing onto one short readable line where the fields ask for that.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      system: sys,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ExtractSchema) },
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't read that document");
    if (msg.stop_reason === "max_tokens") throw new Error("That document was too long to read in one go");
    if (!msg.parsed_output) throw new Error("Couldn't read that document");
    return NextResponse.json({ profile: msg.parsed_output });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't read that document: ${aiErrorMessage(e, "That document was too long to read in one go")}` },
      { status: 500 },
    );
  }
}
