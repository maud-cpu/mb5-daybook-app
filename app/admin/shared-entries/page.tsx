import { requireAdmin } from "@/lib/auth";
import { BUCKETS, EntryRecord } from "@/lib/types";

export default async function SharedEntriesPage() {
  const { supabase } = await requireAdmin();

  const { data: records, error } = await supabase
    .from("records")
    .select("*")
    .eq("shared_with_admin", true)
    .order("created_at", { ascending: false });

  const userIds = [...new Set((records ?? []).map((r) => r.user_id as string))];
  const { data: carers } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = (id: string) => carers?.find((c) => c.id === id)?.display_name || "Unknown";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>Shared with you</h3>
      <p className="hint">
        Only entries a carer has explicitly ticked &quot;send this to the admin&quot; appear here — everything else
        stays private to them.
      </p>
      {error && <p className="empty">Couldn&apos;t load: {error.message}</p>}
      {!error && (records ?? []).length === 0 && <p className="empty">Nothing shared with you yet.</p>}
      {(records as EntryRecord[] | null)?.map((r) => (
        <div className="rec" key={r.id}>
          <b>{nameOf(r.user_id)}</b> · {BUCKETS[r.bucket]}
          {r.child ? " · " + r.child : ""}
          <br />
          {r.bucket === "expenses" ? (
            <>
              {r.kind === "purchase" && `£${r.amount} — `}
              {r.kind === "mileage" && `${r.miles} miles — `}
              {r.kind === "daycare" &&
                `${r.kids.join(" & ") || "no child linked"} ${r.overnight ? "overnight" : r.hours ? r.hours + " hrs" : ""} — `}
              {r.text}
            </>
          ) : r.bucket === "meds" ? (
            <>
              {r.med_name || "medicine not named"}
              {r.dose ? ` — ${r.dose}` : ""}
              {r.given ? ` at ${r.given}` : ""} — {r.text}
            </>
          ) : (
            r.text
          )}
          <br />
          <small className="muted">{r.date}</small>
        </div>
      ))}
    </div>
  );
}
