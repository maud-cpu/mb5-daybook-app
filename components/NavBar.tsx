"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", icon: "✍️", label: "Capture" },
  { href: "/dashboard/calendar", icon: "📅", label: "Calendar" },
  { href: "/dashboard/entries", icon: "🗂️", label: "Entries" },
  { href: "/dashboard/paperwork", icon: "📄", label: "Paperwork" },
  { href: "/dashboard/training", icon: "🎓", label: "Training & Resources" },
  { href: "/dashboard/about", icon: "👪", label: "About us" },
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
