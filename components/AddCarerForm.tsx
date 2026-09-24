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
        <div style={{ height: 8 }} />
        <label>Setup</label>
        <select name="setup" defaultValue="cocarer">
          <option value="cocarer">Co-carer in my own household</option>
          <option value="ownHouseholdSharedContent">Separate household, same rates/training/rota</option>
          <option value="independent">Not with Surrey (own rates/rota, mostly-shared training)</option>
        </select>
        <p className="hint" style={{ marginTop: 2 }}>
          Their children, diary and contacts are always private to them, whatever you choose here
          — that&apos;s automatic either way.
          <br />
          <b>Co-carer</b>: shares your rates/training/rota, can&apos;t manage carers or edit shared
          content themselves.
          <br />
          <b>Separate household, same rates/training/rota</b>: a different foster family (e.g.
          another Surrey carer) who still sees your rates/training/rota/news and can manage their
          own carers, but — like a co-carer — can&apos;t change that shared content themselves;
          only you can.
          <br />
          <b>Not with Surrey</b>: a different local authority/agency, so Surrey&apos;s rates and
          rota don&apos;t apply — they start with blank rates and an empty rota to set up
          themselves. Training starts as a copy of your current catalogue, minus the courses that
          are specifically Surrey&apos;s own mandatory-training requirements — everything else
          (safer caring, PACE, general skills) carries over. They can still connect with you
          afterwards under Circle.
        </p>
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
            They can sign in straight away. There&apos;s no &quot;change password&quot; screen yet —
            tell me when you want one and I&apos;ll add it.
          </p>
        </div>
      )}
    </div>
  );
}
