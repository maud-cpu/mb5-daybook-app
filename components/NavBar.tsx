"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", icon: "✍️", label: "Capture" },
  { href: "/dashboard/entries", icon: "🗂️", label: "Entries" },
  { href: "/dashboard/paperwork", icon: "📄", label: "Paperwork" },
  { href: "/dashboard/training", icon: "🎓", label: "Training" },
  { href: "/dashboard/about", icon: "👪", label: "About us" },
  { href: "/dashboard/rates", icon: "⚙️", label: "Rates" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          {t.icon}
          <br />
          {t.label}
        </Link>
      ))}
      <button onClick={signOut} title="Sign out" style={{ flex: "0 0 auto", padding: "8px 14px" }}>
        🚪
        <br />
        Sign out
      </button>
    </nav>
  );
}
