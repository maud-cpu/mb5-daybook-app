"use client";

import { useState } from "react";
import { removeCarer, resetCarerPassword, shareContentWith } from "@/app/admin/carers/actions";

type Carer = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  account_created_at: string;
  last_sign_in_at: string | null;
  same_household: boolean;
  same_content: boolean;
};

export default function CarerList({ carers }: { carers: Carer[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reset, setReset] = useState<{ id: string; name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  // Optimistic override -- revalidatePath refreshes this from the server too,
  // but that round trip can lag a tap, and the row shouldn't flicker back.
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());

  async function handleShareContent(id: string) {
    setBusyId(id);
    setError("");
    const result = await shareContentWith(id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSharedIds((s) => new Set(s).add(id));
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remove ${name}'s account and all their data? This can't be undone.`)) return;
    setBusyId(id);
    await removeCarer(id);
    setBusyId(null);
  }

  async function handleReset(id: string, name: string) {
    if (!confirm(`Give ${name} a brand new password? Their old one will stop working.`)) return;
    setBusyId(id);
    setCopied(false);
    const result = await resetCarerPassword(id);
    setBusyId(null);
    if (result.error) {
      alert("Couldn't reset password: " + result.error);
      return;
    }
    setReset({ id, name, password: result.password! });
  }

  async function copyPassword() {
    if (!reset) return;
    try {
      await navigator.clipboard.writeText(reset.password);
      setCopied(true);
    } catch {
      // Clipboard access can fail (older browser, no HTTPS, permission
      // denied) -- the password stays on screen either way so nothing's
      // lost, just not copied automatically.
    }
  }

  return (
    <div className="card">
      <h3>Everyone with a login</h3>
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 8 }}>{error}</p>}
      {carers.length === 0 && <p className="empty">No carers yet.</p>}
      {carers.map((c) => {
        const sharesContent = c.same_content || sharedIds.has(c.user_id);
        return (
          <div key={c.user_id} className="rec">
            <b>{c.display_name}</b> {c.role === "admin" && <span className="chip on">admin</span>}{" "}
            {!c.same_household && <span className="chip">separate household</span>}
            <br />
            <small className="muted">
              {c.email} · Joined {new Date(c.account_created_at).toLocaleDateString("en-GB")} · Last signed in{" "}
              {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleDateString("en-GB") : "never"}
            </small>
            {!c.same_household && (
              <>
                <br />
                <small className={sharesContent ? "muted" : undefined} style={sharesContent ? undefined : { color: "var(--danger)" }}>
                  {sharesContent ? "✓ Sees your news/training/rota" : "Not seeing your news/training/rota"}
                </small>
              </>
            )}
            <br />
            {!c.same_household && !sharesContent && (
              <button
                className="chip on"
                style={{ marginLeft: 0, marginTop: 4 }}
                disabled={busyId === c.user_id}
                onClick={() => handleShareContent(c.user_id)}
              >
                Share news/training/rota with them
              </button>
            )}
            <button
              className="chip"
              style={{ marginLeft: c.same_household || sharesContent ? 0 : 8, marginTop: 4 }}
              disabled={busyId === c.user_id}
              onClick={() => handleReset(c.user_id, c.display_name)}
            >
              Reset password
            </button>
            {c.role !== "admin" && (
              <button
                className="chip"
                style={{ marginLeft: 8, marginTop: 4, borderColor: "var(--danger)", color: "var(--danger)" }}
                disabled={busyId === c.user_id}
                onClick={() => handleRemove(c.user_id, c.display_name)}
              >
                Remove
              </button>
            )}
            {reset?.id === c.user_id && (
              <div className="note" style={{ marginTop: 8 }}>
                <b>New password for {reset.name}.</b> This is only shown this once — copy or write it
                down now before doing anything else.
                <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 15 }}>{reset.password}</div>
                <div style={{ marginTop: 8 }}>
                  <button className="chip on" onClick={copyPassword}>
                    {copied ? "Copied ✓" : "Copy password"}
                  </button>{" "}
                  <button className="chip" onClick={() => setReset(null)}>
                    Done, I&apos;ve saved it
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
