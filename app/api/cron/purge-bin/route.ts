import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron hits this once a day (see vercel.json) to make good on the
// Bin's "30 days and it's gone for good" promise across every household at
// once -- the per-household lazy purge on each GET ?bin=1 (see
// app/api/records, /reminders, /children) only catches a household's own
// expired rows when someone actually opens their Bin, so this is the
// backstop that fires regardless. Uses the service-role client since there
// is no signed-in user driving a cron request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [records, reminders, children] = await Promise.all([
    supabase.from("records").delete().lt("deleted_at", cutoff).select("id"),
    supabase.from("reminders").delete().lt("deleted_at", cutoff).select("id"),
    supabase.from("children").delete().lt("deleted_at", cutoff).select("id"),
  ]);
  return NextResponse.json({
    ok: true,
    purged: { records: records.data?.length ?? 0, reminders: reminders.data?.length ?? 0, children: children.data?.length ?? 0 },
  });
}
