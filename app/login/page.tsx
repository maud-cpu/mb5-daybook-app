"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    router.replace("/dashboard");
    router.refresh();
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
