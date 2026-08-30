import { requireAdmin } from "@/lib/auth";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>Admin</h1>
      <p className="empty">Usage dashboard coming shortly.</p>
    </div>
  );
}
