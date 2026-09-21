"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { BUCKETS, Bucket } from "@/lib/types";

const BUCKET_ICON: Record<Bucket, string> = {
  diary: "📔",
  supervision: "🗣️",
  expenses: "💷",
  meds: "💊",
  sw: "📞",
  incident: "⚠",
  scratch: "📝",
};

type TodayEntry = {
  id: string;
  bucket: Bucket;
  text: string;
  kids: string[];
  created_at: string;
  amount: number | null;
  med_name: string;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

// Nothing else on this page shows what's already been logged today -- so a
// note easily gets captured twice, or the carer has to leave the page just
// to check. This is a quiet recap, not another list to action.
export default function TodaysEntriesCard() {
  const supabase = createClient();
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("records")
      .select("id, bucket, text, kids, created_at, amount, med_name")
      .eq("date", today())
      .order("created_at", { ascending: false });
    setEntries((data as TodayEntry[] | null) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card">
      <h3>Today so far{entries.length > 0 ? ` (${entries.length})` : ""}</h3>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">Nothing captured yet today.</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="rec" style={{ cursor: "default" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {fmtTime(e.created_at)} · {BUCKET_ICON[e.bucket]} {BUCKETS[e.bucket]}
              {e.kids.length ? ` · ${e.kids.join(", ")}` : ""}
            </span>
            <div>
              {e.bucket === "meds" && e.med_name ? `${e.med_name} — ` : ""}
              {e.bucket === "expenses" && e.amount != null ? `£${e.amount.toFixed(2)} — ` : ""}
              {e.text.length > 90 ? e.text.slice(0, 90) + "…" : e.text}
            </div>
          </div>
        ))
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        <Link href="/dashboard/entries">Open Entries to edit or see more ↗</Link>
      </p>
    </div>
  );
}
