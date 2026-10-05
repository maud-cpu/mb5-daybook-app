"use client";

import { useEffect, useState } from "react";
import { SocialWorker } from "@/lib/types";

const emptyDraft = { name: "", phone: "", email: "" };

export default function SocialWorkersAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const [items, setItems] = useState<SocialWorker[]>([]);
  const [newDraft, setNewDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Pick<SocialWorker, "name" | "phone" | "email"> | null>(null);

  async function load() {
    const res = await fetch("/api/social-workers");
    const data = await res.json();
    setItems((data.socialWorkers as SocialWorker[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function addSocialWorker() {
    if (!newDraft.name.trim()) return;
    const res = await fetch("/api/social-workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDraft),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast("Couldn't add: " + (data.error || "unknown error"));
      return;
    }
    setNewDraft(emptyDraft);
    load();
    showToast("Added");
  }

  function startEdit(sw: SocialWorker) {
    setEditingId(sw.id);
    setEditDraft({ name: sw.name, phone: sw.phone, email: sw.email });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editDraft.name.trim()) return;
    const res = await fetch("/api/social-workers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch: editDraft }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast("Couldn't save: " + (data.error || "unknown error"));
      return;
    }
    setEditingId(null);
    setEditDraft(null);
    load();
    showToast("Updated — every child linked to this CSW now shows the new details");
  }

  async function removeSocialWorker(id: string) {
    if (!confirm("Remove this social worker? Any child linked to them will show no CSW set, not be deleted.")) return;
    const res = await fetch(`/api/social-workers?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast("Couldn't remove: " + (data.error || "unknown error"));
      return;
    }
    setItems((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="card">
      <h3>Social workers (CSW directory)</h3>
      <p className="hint">
        One shared list of children&apos;s social workers for the whole group — add someone here once, then link them
        to any child in About Us instead of re-typing their details per child. Editing their phone/email here updates
        it everywhere they&apos;re linked, straight away.
      </p>
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <input placeholder="Name" value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} />
        <input
          type="tel"
          placeholder="Phone"
          value={newDraft.phone}
          onChange={(e) => setNewDraft({ ...newDraft, phone: e.target.value })}
        />
        <input
          type="email"
          placeholder="Email"
          value={newDraft.email}
          onChange={(e) => setNewDraft({ ...newDraft, email: e.target.value })}
        />
        <button className="chip add" onClick={addSocialWorker}>
          + Add
        </button>
      </div>
      {items.map((sw) =>
        editingId === sw.id && editDraft ? (
          <div key={sw.id} className="item" style={{ marginTop: 10 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
              <input type="tel" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
              <input type="email" value={editDraft.email} onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} />
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="chip on" onClick={() => saveEdit(sw.id)}>
                Save
              </button>{" "}
              <button className="chip" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            key={sw.id}
            className="rec"
            style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}
          >
            <span style={{ flex: 1, cursor: "pointer" }} onClick={() => startEdit(sw)}>
              <b>{sw.name}</b>
              <br />
              <small className="muted">
                {[sw.phone, sw.email].filter(Boolean).join(" · ") || "no phone/email on file"} · tap to edit
              </small>
            </span>
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => removeSocialWorker(sw.id)}>
              Remove
            </button>
          </div>
        ),
      )}
      {!items.length && <p className="empty">No social workers added yet.</p>}
    </div>
  );
}
