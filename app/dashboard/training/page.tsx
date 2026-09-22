import { Suspense } from "react";
import TrainingScreen from "@/components/TrainingScreen";

export default function TrainingPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <TrainingScreen />
    </Suspense>
  );
}
