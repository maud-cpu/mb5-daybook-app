import { Suspense } from "react";
import SearchScreen from "@/components/SearchScreen";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <SearchScreen />
    </Suspense>
  );
}
