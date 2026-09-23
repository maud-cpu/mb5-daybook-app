import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { email } = await req.json();
  const target = String(email || "").trim().toLowerCase();
  if (!target) return NextResponse.json({ error: "Enter an email address" }, { status: 400 });

  const { data: targetId, error: lookupError } = await supabase.rpc("resolve_user_by_email", {
    target_email: target,
  });
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!targetId) return NextResponse.json({ error: "No account with that email on this app" }, { status: 404 });
  if (targetId === user.id) return NextResponse.json({ error: "That's your own account" }, { status: 400 });

  const { data: existing } = await supabase
    .from("connections")
    .select("id, status, requester_id, recipient_id")
    .or(`and(requester_id.eq.${user.id},recipient_id.eq.${targetId}),and(requester_id.eq.${targetId},recipient_id.eq.${user.id})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return NextResponse.json({ error: "You're already connected" }, { status: 400 });
    if (existing.status === "pending") return NextResponse.json({ error: "A request is already pending between you" }, { status: 400 });
    // Previously declined -- let them try again with a fresh request.
    await supabase.from("connections").delete().eq("id", existing.id);
  }

  const { error: insertError } = await supabase.from("connections").insert({
    requester_id: user.id,
    recipient_id: targetId,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
