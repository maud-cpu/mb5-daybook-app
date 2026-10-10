import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/crypto";
import { regenerateChildLifeSummary } from "@/lib/childLifeSummary";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) return NextResponse.json({ error: "No child given" }, { status: 400 });

  const { data } = await supabase.from("child_life_summary").select("summary_enc, doc_count, updated_at").eq("child_id", childId).single();
  return NextResponse.json({ summary: decryptField(data?.summary_enc), docCount: data?.doc_count ?? 0, updatedAt: data?.updated_at ?? null });
}

// Manual "Refresh" -- rebuilds the cached overview from whatever document
// summaries already exist for this child, without needing a new upload to
// trigger it (e.g. after backfilling several older documents' summaries).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { childId, childName } = await req.json();
  if (!childId) return NextResponse.json({ error: "No child given" }, { status: 400 });

  const summary = await regenerateChildLifeSummary(supabase, childId, childName || "this child");
  return NextResponse.json({ summary });
}
