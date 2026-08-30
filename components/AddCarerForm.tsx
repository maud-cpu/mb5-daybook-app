"use client";

import { useState } from "react";
import { createCarer } from "@/app/admin/carers/actions";

export default function AddCarerForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    const formData = new FormData(e.currentTarget);
    const result = await createCarer(formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.success) {
      setCreated({ email: result.email!, password: result.password! });
      e.currentTarget.reset();
    }
  }

  return (
    <div className="card">
      <h3>Add a carer</h3>
      <form onSubmit={handleSubmit}>
        <label>Their name</label>
        <input name="displayName" placeholder="e.g. Jane Smith" />
        <div style={{ height: 8 }} />
        <label>Their email</label>
        <input name="email" type="email" required placeholder="jane@example.com" />
        {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create login"}
        </button>
      </form>
      {created && (
        <div className="note" style={{ marginTop: 12 }}>
          <b>Account created.</b> Give these to {created.email} — this password is only
          shown this once, so pass it on now (text, call, or hand it over in person):
          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 15 }}>
            {created.email}
            <br />
            {created.password}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            They can sign in straight away. There's no "change password" screen yet —
            tell me when you want one and I'll add it.
          </p>
        </div>
      )}
    </div>
  );
}
