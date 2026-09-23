import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";

// The rota document lands as a real .docx table each month, but some
// carers view/download it in ways that don't let them select and copy
// its text at all -- so instead of relying on copy-paste into the "paste
// the whole rota text" box, this extracts the same plain text straight
// from the uploaded file server-side (mammoth flattens the table into
// one line of text per cell, in reading order, which is exactly what
// that paste box already knows how to parse).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file given" }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: text } = await mammoth.extractRawText({ buffer });
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "Couldn't read that as a Word document" }, { status: 400 });
  }
}
