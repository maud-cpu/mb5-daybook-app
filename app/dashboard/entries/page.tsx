import { Suspense } from "react";
import EntriesScreen from "@/components/EntriesScreen";

export default function EntriesPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <EntriesScreen />
    </Suspense>
  );
}
