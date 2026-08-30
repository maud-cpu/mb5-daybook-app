import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

const LINKS = [
  { href: "/admin", label: "Usage" },
  { href: "/admin/carers", label: "Carers" },
  { href: "/admin/shared", label: "Shared content" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 800, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 19 }}>MB5 Day Book — Admin</h1>
        <SignOutButton />
      </header>
      <div className="tabs">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="chip">
            {l.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
