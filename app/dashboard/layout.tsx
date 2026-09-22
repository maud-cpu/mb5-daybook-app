import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import QuickAccessButtons from "@/components/QuickAccessButtons";
import RouteRemount from "@/components/RouteRemount";
import SignOutButton from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <>
      <header className="topbar">
        <h1>MB5 Day Book</h1>
        <SignOutButton />
      </header>
      <QuickAccessButtons />
      <div id="view" className="dashboard-view">
        <RouteRemount>{children}</RouteRemount>
      </div>
      <NavBar />
    </>
  );
}
