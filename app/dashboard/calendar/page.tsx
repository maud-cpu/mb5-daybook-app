import { Suspense } from "react";
import CalendarScreen from "@/components/CalendarScreen";

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <CalendarScreen />
    </Suspense>
  );
}
