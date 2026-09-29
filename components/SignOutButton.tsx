"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // So a backup-code bypass from this browser never carries over to
    // whoever signs in next on the same device (see lib/mfa.ts).
    await fetch("/api/mfa/clear-bypass", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: "var(--grey)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        textDecoration: "underline",
        textUnderlineOffset: 2,
      }}
    >
      Sign out
    </button>
  );
}
