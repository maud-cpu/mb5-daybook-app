"use client";

import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { BUCKETS, Child, EntryRecord, Reminder } from "@/lib/types";

type BinKind = "record" | "reminder" | "child";

const ENDPOINTS: Record<BinKind, string> = {
  record: "/api/records",
  reminder: "/api/reminders",
  child: "/api/children",
};

function daysLeft(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Row({
  label,
  deletedAt,
  onRestore,
  onPurge,
}: {
  label: string;
  deletedAt: string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const left = daysLeft(deletedAt);
  return (
    <div className="rec">
      <span>{label}</span>
      <br />
      <small>
        Deleted {fmt(deletedAt)} · {left} day{left === 1 ? "" : "s"} left
      </small>
      <div className="row" style={{ marginTop: 4 }}>
        <button className="chip" style={{ flex: "0 0 auto" }} onClick={onRestore}>
          ↩ Restore
        </button>
        <button className="chip" style={{ flex: "0 0 auto" }} onClick={onPurge}>
          Delete forever
        </button>
      </div>
    </div>
  );
}

// The Bin tab in Entries -- anything deleted through the app (Entries/
// Expenses, Calendar reminders, or a child in About Us) lands here for 30
// days before the nightly purge job removes it for good, so an accidental
// delete is never actually final. See 0086_recycle_bin.sql.
export default function BinPanel() {
  const [records, setRecords] = useState<EntryRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingPurge, setPendingPurge] = useState<{ kind: BinKind; id: string; label: string } | null>(null);

  async function load() {
    setLoading(true);
    const [r, rem, c] = await Promise.all([
      fetch("/api/records?bin=1").then((res) => res.json()),
      fetch("/api/reminders?bin=1").then((res) => res.json()),
      fetch("/api/children?bin=1").then((res) => res.json()),
    ]);
    setRecords((r.records as EntryRecord[]) ?? []);
    setReminders((rem.reminders as Reminder[]) ?? []);
    setChildren((c.children as Child[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    load();
  }, []);

  async function restore(kind: BinKind, id: string) {
    await fetch(ENDPOINTS[kind], {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch: { deleted_at: null } }),
    });
    load();
  }

  async function confirmPurge() {
    const target = pendingPurge;
    if (!target) return;
    setPendingPurge(null);
    const idParam = target.kind === "record" ? `ids=${target.id}` : `id=${target.id}`;
    await fetch(`${ENDPOINTS[target.kind]}?${idParam}&hard=1`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="muted">Loading…</p>;

  const empty = !records.length && !reminders.length && !children.length;

  return (
    <div>
      <p className="hint">Anything deleted in the last 30 days sits here and can be restored. After 30 days it&apos;s gone for good.</p>
      {empty && <p className="empty">The bin is empty.</p>}

      {records.length > 0 && (
        <div className="card">
          <h3>Entries &amp; Expenses</h3>
          {records.map((r) => (
            <Row
              key={r.id}
              label={`${BUCKETS[r.bucket]}: ${r.text || "(no text)"}`}
              deletedAt={r.deleted_at!}
              onRestore={() => restore("record", r.id)}
              onPurge={() => setPendingPurge({ kind: "record", id: r.id, label: r.text || "this entry" })}
            />
          ))}
        </div>
      )}

      {reminders.length > 0 && (
        <div className="card">
          <h3>Calendar reminders</h3>
          {reminders.map((r) => (
            <Row
              key={r.id}
              label={r.text}
              deletedAt={r.deleted_at!}
              onRestore={() => restore("reminder", r.id)}
              onPurge={() => setPendingPurge({ kind: "reminder", id: r.id, label: r.text })}
            />
          ))}
        </div>
      )}

      {children.length > 0 && (
        <div className="card">
          <h3>Children</h3>
          {children.map((c) => (
            <Row
              key={c.id}
              label={c.name}
              deletedAt={c.deleted_at!}
              onRestore={() => restore("child", c.id)}
              onPurge={() => setPendingPurge({ kind: "child", id: c.id, label: c.name })}
            />
          ))}
        </div>
      )}

      {pendingPurge && (
        <ConfirmDialog
          title="Delete this forever?"
          itemLabel={pendingPurge.label}
          confirmLabel="Delete forever"
          onConfirm={confirmPurge}
          onCancel={() => setPendingPurge(null)}
        />
      )}
    </div>
  );
}
