"use client";

import { useState } from "react";
import { removeCarer } from "@/app/admin/carers/actions";

type Carer = {
  user_id: string;
  display_name: string;
  role: string;
  account_created_at: string;
  last_sign_in_at: string | null;
};

export default function CarerList({ carers }: { carers: Carer[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remove ${name}'s account and all their data? This can't be undone.`)) return;
    setBusyId(id);
    await removeCarer(id);
    setBusyId(null);
  }

  return (
    <div className="card">
      <h3>Everyone with a login</h3>
      {carers.length === 0 && <p className="empty">No carers yet.</p>}
      {carers.map((c) => (
        <div key={c.user_id} className="rec">
          <b>{c.display_name}</b> {c.role === "admin" && <span className="chip on">admin</span>}
          <br />
          <small className="muted">
            Joined {new Date(c.account_created_at).toLocaleDateString("en-GB")} · Last signed in{" "}
            {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleDateString("en-GB") : "never"}
          </small>
          {c.role !== "admin" && (
            <button
              className="chip"
              style={{ marginLeft: 8, borderColor: "var(--danger)", color: "var(--danger)" }}
              disabled={busyId === c.user_id}
              onClick={() => handleRemove(c.user_id, c.display_name)}
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
