import { requireAdmin } from "@/lib/auth";
import { computeUsage, EntryDateRow } from "@/lib/usageStats";

export default async function AdminPage() {
  const { supabase } = await requireAdmin();

  const [{ data: carers, error: carersError }, { data: entryDates, error: entriesError }] = await Promise.all([
    supabase.rpc("admin_carer_overview"),
    supabase.rpc("admin_entry_dates"),
  ]);

  const usage = computeUsage((entryDates as EntryDateRow[]) ?? []);
  const carerRows = (carers ?? []).filter((c: { role: string }) => c.role === "carer");

  return (
    <div style={{ marginTop: 12 }}>
      <div className="card">
        <h3>Usage — never the content, just the numbers</h3>
        <p className="hint">
          Logins, how many entries each carer has made, and how recently — never what they actually wrote.
        </p>
        {(carersError || entriesError) && (
          <p className="empty">Couldn&apos;t load usage: {carersError?.message || entriesError?.message}</p>
        )}
        {carerRows.length === 0 && !carersError && <p className="empty">No carers yet — add one under Carers.</p>}
        {carerRows.map((c: { user_id: string; display_name: string; last_sign_in_at: string | null }) => {
          const u = usage.get(c.user_id);
          return (
            <div className="rec" key={c.user_id}>
              <b>{c.display_name}</b>
              <br />
              <small className="muted">
                Last signed in{" "}
                {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleDateString("en-GB") : "never"} ·{" "}
                {u?.totalEntries ?? 0} entries total ({u?.entries7d ?? 0} this week, {u?.entries30d ?? 0} this month)
                {u?.daysSinceLastEntry !== null && u?.daysSinceLastEntry !== undefined
                  ? ` · last entry ${u.daysSinceLastEntry === 0 ? "today" : `${u.daysSinceLastEntry}d ago`}`
                  : " · no entries yet"}
                {u && u.streak > 1 ? ` · 🔥 ${u.streak}-day streak` : ""}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
