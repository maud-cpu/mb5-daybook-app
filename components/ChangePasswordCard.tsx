"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordCard() {
  const supabase = createClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (next !== next2) {
      setError("Those two don't match.");
      return;
    }
    if (next.length < 8) {
      setError("Please use at least 8 characters.");
      return;
    }
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (signInError) {
        setBusy(false);
        setError("Current password is not correct.");
        return;
      }
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrent("");
    setNext("");
    setNext2("");
    setMsg("Password changed.");
  }

  return (
    <div className="card">
      <h3>Change your password</h3>
      <form onSubmit={submit}>
        <label>Current password</label>
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <div style={{ height: 8 }} />
        <label>New password</label>
        <input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <div style={{ height: 8 }} />
        <label>Confirm new password</label>
        <input type="password" required autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} />
        {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
        {msg && <p className="hint">{msg}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
