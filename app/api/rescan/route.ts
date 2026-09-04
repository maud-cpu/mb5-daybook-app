import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backstopFlag, FLAG_TRAINING } from "@/lib/keywordFlags";
import { FlagKey } from "@/lib/types";

/**
 * Re-runs the keyword safety net over every already-saved entry, so an
 * improvement to detection (or a bug fix) sweeps back through old entries
 * instead of only applying to new ones. Two things it does:
 *  - unflagged entries (that the carer hasn't deliberately cleared a flag
 *    from) get checked against the keyword backstop
 *  - already-flagged entries missing a training suggestion get one
 *    attached, if the flag has a matching course
 * RLS scopes every read/write to the signed-in carer's own records.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: records, error } = await supabase
    .from("records")
    .select("id, text, flag, flag_cleared, training_note");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let changed = 0;
  for (const r of records ?? []) {
    const patch: Record<string, string> = {};

    if (!r.flag && !r.flag_cleared) {
      const backstop = backstopFlag(r.text || "");
      if (backstop.flag) {
        patch.flag = backstop.flag;
        patch.flag_note = backstop.flagNote;
      }
    }

    const effectiveFlag = (patch.flag || r.flag) as FlagKey | "";
    if (effectiveFlag && !r.training_note) {
      const suggestion = FLAG_TRAINING[effectiveFlag];
      if (suggestion) patch.training_note = `${suggestion.course} — ${suggestion.why}`;
    }

    if (Object.keys(patch).length) {
      const { error: updateError } = await supabase.from("records").update(patch).eq("id", r.id);
      if (!updateError) changed++;
    }
  }

  return NextResponse.json({ changed });
}
