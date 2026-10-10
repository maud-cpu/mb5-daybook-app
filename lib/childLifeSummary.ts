import Anthropic from "@anthropic-ai/sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import { decryptField, encryptField } from "@/lib/crypto";

// Rebuilds a child's cached "so far" overview from every document summary
// already on file for them -- never from the raw files themselves, so this
// stays cheap even when someone's uploaded years of diaries: the input here
// is a handful of short paragraphs, not the documents those paragraphs were
// written from. Called after a new document gets its own summary, and from
// a manual "Refresh" action once several older documents have been
// backfilled. Overwrites the cached row outright rather than asking the AI
// to merge new information into its own previous output -- regenerating
// from the same small set of source summaries every time avoids the drift
// an incremental "update what you said before" chain would risk over years
// of repeated edits.
export async function regenerateChildLifeSummary(supabase: SupabaseClient, childId: string, childName: string): Promise<string> {
  const { data: docs } = await supabase
    .from("child_documents")
    .select("title, file_name, category, uploaded_at, summary_enc")
    .eq("child_id", childId)
    .order("uploaded_at");

  const summarised = (docs ?? [])
    .map((d) => ({ ...d, summary: decryptField(d.summary_enc) }))
    .filter((d) => d.summary);

  if (!summarised.length) {
    await supabase.from("child_life_summary").upsert({
      child_id: childId,
      summary_enc: "",
      doc_count: 0,
      updated_at: new Date().toISOString(),
    });
    return "";
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return decryptField((await supabase.from("child_life_summary").select("summary_enc").eq("child_id", childId).single()).data?.summary_enc);

  const listText = summarised
    .map((d) => `- ${d.title || d.file_name}${d.category ? ` (${d.category})` : ""}, added ${d.uploaded_at.slice(0, 10)}: ${d.summary}`)
    .join("\n");

  const sys = `You help a UK foster carer keep a running picture of a child in their care, built from the summaries of every document they've uploaded about that child (old diaries, previous placements' handover notes, assessments, reports, correspondence). You are not shown the documents themselves, only short summaries of each.

Write a short (120-200 words) plain-English overview of ${childName} as a person -- their background and history, what's known about their needs, and anything that stands out across the documents. Write in third person, plain British English, no heading, no bullet points, just prose. Note the date range the documents span if that's useful context.

Never invent or assume anything beyond what the summaries actually say. If there's too little here to say anything meaningful, say that plainly instead of padding it out. If anything reads like it could be a current safeguarding concern, say so plainly rather than softening it -- though these documents are often historical, so don't imply something is still happening unless the summaries say so.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 700,
      system: sys,
      messages: [{ role: "user", content: `Documents on file for ${childName}, oldest first:\n\n${listText}` }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    await supabase.from("child_life_summary").upsert({
      child_id: childId,
      summary_enc: encryptField(text),
      doc_count: summarised.length,
      updated_at: new Date().toISOString(),
    });
    return text;
  } catch {
    // The per-document summary (already saved before this runs) is the
    // important part -- if this second, child-level pass fails, leave
    // whatever overview was cached before untouched rather than blanking it.
    const { data } = await supabase.from("child_life_summary").select("summary_enc").eq("child_id", childId).single();
    return decryptField(data?.summary_enc);
  }
}
