"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Shortened for the tab bar's tight width -- each page's own <h3> still
// uses the full name ("Training & Resources", "About us").
const TABS = [
  { href: "/dashboard", icon: "✍️", label: "Capture" },
  { href: "/dashboard/calendar", icon: "📅", label: "Calendar" },
  { href: "/dashboard/entries", icon: "🗂️", label: "Entries" },
  { href: "/dashboard/paperwork", icon: "📄", label: "Paperwork" },
  { href: "/dashboard/training", icon: "🎓", label: "Training" },
  { href: "/dashboard/about", icon: "👪", label: "About" },
  { href: "/dashboard/rates", icon: "⚙️", label: "Rates" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          <span>{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
