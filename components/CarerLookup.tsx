"use client";

import { useState } from "react";
import { lookupCarer, removeCarer, resetCarerPassword, shareContentWith } from "@/app/admin/carers/actions";

type FoundCarer = {
  user_id: string;
  display_name: string;
  role: string;
  account_created_at: string;
  last_sign_in_at: string | null;
  same_household: boolean;
  same_content: boolean;
};

// The main "Everyone with a login" list only ever shows co-carers sharing
// THIS admin's own household -- an account set up as a genuinely separate
// household (a different foster family) is invisible there again the
// moment it's created, even though this same admin made it. This is the
// only way back to one: by email, to check they've actually signed in,
// reset a forgotten password, or fix whether they're seeing this admin's
// own news/training/rota updates.
export default function CarerLookup() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<FoundCarer | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reset, setReset] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    setFound(null);
    setReset(null);
    const result = await lookupCarer(email);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFound(result.carer as FoundCarer);
  }

  async function handleShareContent() {
    if (!found) return;
    setActionBusy(true);
    const result = await shareContentWith(found.user_id);
    setActionBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFound({ ...found, same_content: true });
  }

  async function handleReset() {
    if (!found) return;
    if (!confirm(`Give ${found.display_name} a brand new password? Their old one will stop working.`)) return;
    setActionBusy(true);
    setCopied(false);
    const result = await resetCarerPassword(found.user_id);
    setActionBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReset(result.password!);
  }

  async function handleRemove() {
    if (!found) return;
    if (!confirm(`Remove ${found.display_name}'s account and all their data? This can't be undone.`)) return;
    setActionBusy(true);
    const result = await removeCarer(found.user_id);
    setActionBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFound(null);
    setEmail("");
  }

  async function copyPassword() {
    if (!reset) return;
    try {
      await navigator.clipboard.writeText(reset);
      setCopied(true);
    } catch {
      // Clipboard access can fail -- the password stays on screen either way.
    }
  }

  return (
    <div className="card">
      <h3>Find an account</h3>
      <p className="hint">
        For an account set up as a separate household — their own children/diary/calendar stay private, but this is
        the only way to check they&apos;ve signed in, reset a forgotten password, or fix whether they&apos;re seeing
        your news/training/rota, since they never show up in the list above.
      </p>
      <form onSubmit={handleLookup} className="row">
        <input type="email" placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" style={{ flex: "0 0 auto" }} type="submit" disabled={busy || !email.trim()}>
          {busy ? "Looking…" : "Find"}
        </button>
      </form>
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 6 }}>{error}</p>}
      {found && (
        <div className="rec" style={{ marginTop: 10 }}>
          <b>{found.display_name}</b> {found.role === "admin" && <span className="chip on">admin</span>}
          <br />
          <small className="muted">
            Joined {new Date(found.account_created_at).toLocaleDateString("en-GB")} · Last signed in{" "}
            {found.last_sign_in_at ? new Date(found.last_sign_in_at).toLocaleDateString("en-GB") : "never"}
          </small>
          <p className="note" style={{ marginTop: 8 }}>
            {found.same_household ? "In your own household." : "A separate household — their own children/diary/calendar."}
            <br />
            {found.same_content
              ? "✓ Already seeing your news/training/rota."
              : "Not currently seeing your news/training/rota."}
          </p>
          <div style={{ marginTop: 8 }}>
            {!found.same_content && (
              <>
                <button className="chip on" disabled={actionBusy} onClick={handleShareContent}>
                  Share your news/training/rota with them
                </button>{" "}
              </>
            )}
            <button className="chip" disabled={actionBusy} onClick={handleReset}>
              Reset password
            </button>{" "}
            {found.role !== "admin" && (
              <button
                className="chip"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                disabled={actionBusy}
                onClick={handleRemove}
              >
                Remove
              </button>
            )}
          </div>
          {reset && (
            <div className="note" style={{ marginTop: 8 }}>
              <b>New password for {found.display_name}.</b> This is only shown this once — copy or write it down now
              before doing anything else.
              <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 15 }}>{reset}</div>
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
      )}
    </div>
  );
}
