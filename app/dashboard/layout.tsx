import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import QuickAccessButtons from "@/components/QuickAccessButtons";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <>
      <header style={{ padding: "16px 100px 8px 16px", display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 19 }}>MB5 Day Book</h1>
      </header>
      <QuickAccessButtons />
      <div id="view" style={{ padding: "12px 14px 24px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        {children}
      </div>
      <NavBar />
    </>
  );
}
