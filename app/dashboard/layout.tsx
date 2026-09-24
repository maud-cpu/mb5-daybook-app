import { requireUser } from "@/lib/auth";
import AutoLock from "@/components/AutoLock";
import NavBar from "@/components/NavBar";
import QuickAccessButtons from "@/components/QuickAccessButtons";
import RouteRemount from "@/components/RouteRemount";
import SignOutButton from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();

  return (
    <AutoLock>
      <header className="topbar">
        <h1>MB5 Day Book</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            className="muted"
            style={{ fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title="Signed in as"
          >
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <QuickAccessButtons />
      <div id="view" className="dashboard-view">
        <RouteRemount>{children}</RouteRemount>
      </div>
      <NavBar />
    </AutoLock>
  );
}
