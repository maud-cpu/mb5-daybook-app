import { Suspense } from "react";
import AboutScreen from "@/components/AboutScreen";

export default function AboutPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AboutScreen />
    </Suspense>
  );
}
