"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", icon: "✍️", label: "Capture" },
  { href: "/dashboard/calendar", icon: "📅", label: "Calendar" },
  { href: "/dashboard/entries", icon: "🗂️", label: "Entries" },
  { href: "/dashboard/paperwork", icon: "📄", label: "Paperwork" },
  { href: "/dashboard/training", icon: "🎓", label: "Training & Resources" },
  { href: "/dashboard/circle", icon: "🤝", label: "Circle" },
  { href: "/dashboard/about", icon: "👪", label: "About us" },
  { href: "/dashboard/rates", icon: "⚙️", label: "Rates" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("connections")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("status", "pending");
      setPendingRequests(count ?? 0);
    }
    load();
  }, []);

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          <span style={{ position: "relative" }}>
            {t.icon}
            {t.href === "/dashboard/circle" && pendingRequests > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  background: "var(--danger)",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  fontSize: 10,
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {pendingRequests}
              </span>
            )}
          </span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
