"use client";

import { useState } from "react";
import { createCarer } from "@/app/admin/carers/actions";

export default function AddCarerForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    setCopied(false);
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

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      // Clipboard access can fail (older browser, no HTTPS, permission
      // denied) -- the password stays on screen either way so nothing's
      // lost, just not copied automatically.
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
          Their own training records and login stay separate whatever you choose here — only the
          three options below change who they share children/diary/calendar/contacts and
          rates/training/rota with.
          <br />
          <b>Co-carer</b>: full sharing — same children, diary, calendar, contacts and household
          info as you, plus your rates/training/rota. Can&apos;t manage carers or edit shared
          content themselves.
          <br />
          <b>Separate household, same rates/training/rota</b>: a different foster family (e.g.
          another Surrey carer) with their own separate children/diary/calendar, who still sees
          your rates/training/rota/news and can manage their own carers, but — like a co-carer —
          can&apos;t change that shared content themselves; only you can.
          <br />
          <b>Not with Surrey</b>: their own separate children/diary/calendar and a different local
          authority/agency, so Surrey&apos;s rates and rota don&apos;t apply — they start with
          blank rates and an empty rota to set up themselves. Training starts as a copy of your
          current catalogue, minus the courses that are specifically Surrey&apos;s own
          mandatory-training requirements — everything else (safer caring, PACE, general skills)
          carries over. They can still connect with you afterwards under Circle.
        </p>
        {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create login"}
        </button>
      </form>
      {created && (
        <div className="note" style={{ marginTop: 12 }}>
          <b>Account created.</b> Give these to {created.email} — this password is only
          shown this once, so copy or write it down now before doing anything else:
          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 15 }}>
            {created.email}
            <br />
            {created.password}
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="chip on" onClick={copyPassword}>
              {copied ? "Copied ✓" : "Copy password"}
            </button>{" "}
            <button type="button" className="chip" onClick={() => setCreated(null)}>
              Done, I&apos;ve saved it
            </button>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            They can sign in straight away. If you ever lose a password after this, use
            &quot;Reset password&quot; next to their name in the list below to generate a new one.
          </p>
        </div>
      )}
    </div>
  );
}
