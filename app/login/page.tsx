"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Email or password not recognised.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      setRecoveryMsg("Those two don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setRecoveryMsg("Please use at least 8 characters.");
      return;
    }
    setBusy(true);
    setRecoveryMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setRecoveryMsg(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (recovery) {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: "60px auto 0" }}>
        <h1 style={{ fontSize: 22, textAlign: "center" }}>MB5 Day Book</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          Set a new password
        </p>
        <form className="card" onSubmit={handleSetPassword}>
          <label>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <div style={{ height: 10 }} />
          <label>Confirm new password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
          />
          {recoveryMsg && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{recoveryMsg}</p>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 400, margin: "60px auto 0" }}>
      <h1 style={{ fontSize: 22, textAlign: "center" }}>MB5 Day Book</h1>
      <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
        Sign in with the details you were given
      </p>
      <form className="card" onSubmit={handleSubmit}>
        <label>Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div style={{ height: 10 }} />
        <label>Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="hint" style={{ textAlign: "center" }}>
        No account yet? Ask whoever set up your fostering hub for a login.
      </p>
    </div>
  );
}
