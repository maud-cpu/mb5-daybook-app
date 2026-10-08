"use client";

import { useEffect, useState } from "react";
import { firstName } from "@/lib/domain";

type HubEntry = { id: string; carer_name: string; phone: string; email: string };
type Draft = { carer_name: string; phone: string; email: string };

function blankDraft(): Draft {
  return { carer_name: "", phone: "", email: "" };
}

function hubLabel(carerName: string): string {
  return carerName.trim() ? `${firstName(carerName)}'s hub` : "(unnamed hub)";
}

// A household's own small reference list of real Mockingbird hub carers --
// each one's "hub name" is always derived from their first name (never its
// own typed-in field), so it can never drift out of sync with a later name
// edit. About us's "Your Mockingbird" picker reads this list to offer
// "which hub?" and auto-fill the hub carer's phone/email -- see
// 0091_hub_directory.sql for why this is admin-write, household-read.
export default function HubDirectoryAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const [hubs, setHubs] = useState<HubEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/hub-directory");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Couldn't load the hub directory");
    } else {
      setHubs((data.hubs as HubEntry[] | null) ?? []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addHub() {
    if (!draft.carer_name.trim() || adding) return;
    setAdding(true);
    const res = await fetch("/api/hub-directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setAdding(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Couldn't add that hub");
      return;
    }
    setDraft(blankDraft());
    load();
  }

  async function updateHub(id: string, patch: Partial<Draft>) {
    setHubs((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    const res = await fetch("/api/hub-directory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Couldn't save that change");
      load();
    }
  }

  async function removeHub(id: string, label: string) {
    if (!confirm(`Remove ${label}? Any household currently using it won't lose what they already filled in, but can't pick it again.`)) return;
    setRemovingId(id);
    setHubs((prev) => prev.filter((h) => h.id !== id));
    const res = await fetch(`/api/hub-directory?id=${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Couldn't remove that hub");
      load();
    }
  }

  if (!loaded) return null;

  return (
    <div className="card">
      <h3>Mockingbird hub directory</h3>
      <p className="hint">
        Real hub carers you&apos;d want to pick from on &quot;Your Mockingbird&quot; (About us) — add one here once
        and every carer in your household can select it there instead of typing it out. Each one&apos;s &quot;hub
        name&quot; is always their first name&apos;s hub (e.g. &quot;Maud&quot; → &quot;Maud&apos;s hub&quot;).
      </p>
      {hubs.length === 0 && <p className="empty">No hub carers added yet.</p>}
      {hubs.map((h) => (
        <div key={h.id} className="item" style={{ marginTop: 8 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <b style={{ flex: 1 }}>{hubLabel(h.carer_name)}</b>
            <button className="delete-btn" disabled={removingId === h.id} onClick={() => removeHub(h.id, hubLabel(h.carer_name))}>
              🗑 Delete
            </button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input
              key={`name:${h.id}`}
              placeholder="Hub carer's name"
              defaultValue={h.carer_name}
              onBlur={(e) => updateHub(h.id, { carer_name: e.target.value })}
            />
            <input
              key={`phone:${h.id}`}
              placeholder="Phone"
              defaultValue={h.phone}
              onBlur={(e) => updateHub(h.id, { phone: e.target.value })}
            />
          </div>
          <input
            key={`email:${h.id}`}
            placeholder="Email"
            defaultValue={h.email}
            style={{ marginTop: 6 }}
            onBlur={(e) => updateHub(h.id, { email: e.target.value })}
          />
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <input
          placeholder="Hub carer's name"
          value={draft.carer_name}
          onChange={(e) => setDraft({ ...draft, carer_name: e.target.value })}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <input placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </div>
        <button className="chip" style={{ marginTop: 6 }} disabled={adding || !draft.carer_name.trim()} onClick={addHub}>
          + Add hub carer
        </button>
      </div>
    </div>
  );
}
