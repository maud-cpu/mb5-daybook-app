"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

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

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          {t.icon}
          <br />
          {t.label}
        </Link>
      ))}
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "0 10px" }}>
        <SignOutButton />
      </div>
    </nav>
  );
}
