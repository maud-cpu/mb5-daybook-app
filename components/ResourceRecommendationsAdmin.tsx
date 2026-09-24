"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Recommendation = {
  id: string;
  title: string;
  kind: string;
  description: string;
  url: string;
  status: "pending" | "approved";
};

type Draft = { title: string; kind: string; description: string; url: string };

const KIND_LABELS: Record<string, string> = {
  book: "📖 Book",
  movie: "🎬 Movie/TV",
  podcast: "🎙️ Podcast",
  other: "💡 Other",
};

export default function ResourceRecommendationsAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const supabase = createClient();
  const [pending, setPending] = useState<Recommendation[]>([]);
  // Once approved, a suggestion only ever showed up in the read-only
  // "Recommended by carers" list on the normal Training & Resources page --
  // nowhere in Admin let you go back and fix a typo or dead link. This
  // keeps every published one visible and editable here too.
  const [approved, setApproved] = useState<Recommendation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  async function load() {
    const { data } = await supabase
      .from("resource_recommendations")
      .select("id, title, kind, description, url, status")
      .in("status", ["pending", "approved"])
      .order("created_at");
    const rows = (data as Recommendation[] | null) ?? [];
    setPending(rows.filter((r) => r.status === "pending"));
    setApproved(rows.filter((r) => r.status === "approved"));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(r: Recommendation) {
    setEditingId(r.id);
    setEditDraft({ title: r.title, kind: r.kind, description: r.description, url: r.url });
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editDraft.title.trim()) return;
    const patch = {
      title: editDraft.title.trim(),
      kind: editDraft.kind,
      description: editDraft.description.trim(),
      url: editDraft.url.trim(),
    };
    const { data, error } = await supabase.from("resource_recommendations").update(patch).eq("id", id).select("id");
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      showToast("Couldn't save — you may not be signed in as the account that can edit this household's suggestions.");
      return;
    }
    const apply = (r: Recommendation) => (r.id === id ? { ...r, ...patch } : r);
    setPending((prev) => prev.map(apply));
    setApproved((prev) => prev.map(apply));
    setEditingId(null);
    setEditDraft(null);
  }

  async function review(id: string, status: "approved" | "rejected") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // RLS only lets the literal content owner write these rows -- if this
    // account isn't that (e.g. a separate admin login from whoever
    // suggested it), the update matches zero rows and Postgres reports that
    // as a normal success, not an error. Without checking that a row
    // actually came back, this silently did nothing: the item vanished from
    // this list (state was updated regardless) while staying "pending" in
    // the database forever, invisible everywhere.
    const { data, error } = await supabase
      .from("resource_recommendations")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      showToast("Couldn't update: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      showToast("Couldn't update — you may not be signed in as the account that can approve this household's suggestions.");
      return;
    }
    const item = pending.find((r) => r.id === id);
    setPending((prev) => prev.filter((r) => r.id !== id));
    if (status === "approved" && item) setApproved((prev) => [...prev, { ...item, status: "approved" }]);
    showToast(status === "approved" ? "Published to Training & Resources" : "Rejected");
  }

  async function remove(id: string) {
    if (!confirm("Remove this from Training & Resources? This can't be undone.")) return;
    const { error } = await supabase.from("resource_recommendations").delete().eq("id", id);
    if (error) {
      showToast("Couldn't remove: " + error.message);
      return;
    }
    setApproved((prev) => prev.filter((r) => r.id !== id));
    showToast("Removed");
  }

  function editForm(id: string) {
    if (!editDraft) return null;
    return (
      <div className="item" style={{ marginBottom: 10 }}>
        <div className="row">
          <input
            placeholder="Title"
            value={editDraft.title}
            onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
            style={{ flex: 2 }}
          />
          <select
            value={editDraft.kind}
            onChange={(e) => setEditDraft({ ...editDraft, kind: e.target.value })}
            style={{ flex: "0 0 auto", width: "auto" }}
          >
            <option value="book">📖 Book</option>
            <option value="movie">🎬 Movie/TV</option>
            <option value="podcast">🎙️ Podcast</option>
            <option value="other">💡 Other</option>
          </select>
        </div>
        <textarea
          placeholder="Description"
          value={editDraft.description}
          onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
          style={{ marginTop: 6 }}
        />
        <input
          placeholder="Link"
          value={editDraft.url}
          onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
          style={{ marginTop: 6 }}
        />
        <div style={{ marginTop: 8 }}>
          <button className="chip" onClick={() => saveEdit(id)} disabled={!editDraft.title.trim()}>
            Save
          </button>{" "}
          <button
            className="chip"
            onClick={() => {
              setEditingId(null);
              setEditDraft(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!loaded || (!pending.length && !approved.length)) return null;

  return (
    <>
      {pending.length > 0 && (
        <div className="card" style={{ border: "2px solid var(--accent)" }}>
          <h3>💡 Resource suggestions to review ({pending.length})</h3>
          {pending.map((r) =>
            editingId === r.id ? (
              <div key={r.id}>{editForm(r.id)}</div>
            ) : (
              <div key={r.id} className="rec">
                <b onClick={() => startEdit(r)} style={{ cursor: "pointer" }} title="Tap to edit before publishing">
                  {KIND_LABELS[r.kind] || r.kind} {r.title}
                </b>
                {r.description && (
                  <>
                    <br />
                    <small className="muted">{r.description}</small>
                  </>
                )}
                {r.url && (
                  <>
                    <br />
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      <small>{r.url}</small>
                    </a>
                  </>
                )}
                <div style={{ marginTop: 6 }}>
                  <button className="chip on" onClick={() => review(r.id, "approved")}>
                    Approve
                  </button>{" "}
                  <button className="chip" onClick={() => review(r.id, "rejected")}>
                    Reject
                  </button>{" "}
                  <button className="chip" onClick={() => startEdit(r)}>
                    ✏️ Edit
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {approved.length > 0 && (
        <div className="card">
          <h3>📚 Published resources ({approved.length})</h3>
          <p className="hint">Live on everyone&apos;s Training &amp; Resources page — edit or remove one here.</p>
          {approved.map((r) =>
            editingId === r.id ? (
              <div key={r.id}>{editForm(r.id)}</div>
            ) : (
              <div key={r.id} className="rec">
                <b onClick={() => startEdit(r)} style={{ cursor: "pointer" }} title="Tap to edit">
                  {KIND_LABELS[r.kind] || r.kind} {r.title}
                </b>
                {r.description && (
                  <>
                    <br />
                    <small className="muted">{r.description}</small>
                  </>
                )}
                {r.url && (
                  <>
                    <br />
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      <small>{r.url}</small>
                    </a>
                  </>
                )}
                <div style={{ marginTop: 6 }}>
                  <button className="chip" onClick={() => startEdit(r)}>
                    ✏️ Edit
                  </button>{" "}
                  <button className="chip" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => remove(r.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}
