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
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  async function checkMfaOutstanding() {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (factor) {
        setMfaFactorId(factor.id);
        return true;
      }
    }
    return false;
  }

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    // Landing here already signed in but with MFA outstanding -- e.g. the
    // middleware sent a not-yet-verified session straight back to /login --
    // skip re-asking for the password and go straight to the code step.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) checkMfaOutstanding();
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setError("Email or password not recognised.");
      return;
    }
    const mfaOutstanding = await checkMfaOutstanding();
    setBusy(false);
    if (mfaOutstanding) return;
    router.replace("/");
    router.refresh();
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setBusy(true);
    setMfaError("");
    const supabase = createClient();
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chErr || !challenge) {
      setBusy(false);
      setMfaError(chErr?.message || "Couldn't start the check — try again.");
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim() });
    setBusy(false);
    if (vErr) {
      setMfaError("That code wasn't right — try again. If it keeps failing, check your phone's clock is set to automatic/network time.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function handleRedeemBackupCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMfaError("");
    const res = await fetch("/api/mfa/redeem-backup-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: backupCode }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMfaError(data.error || "That code didn't work.");
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

  if (mfaFactorId) {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: "60px auto 0" }}>
        <h1 style={{ fontSize: 22, textAlign: "center" }}>Foster Carer Log</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 20 }}>
          {useBackupCode ? "Enter one of your backup codes" : "Enter the code from your authenticator app"}
        </p>
        {useBackupCode ? (
          <form className="card" onSubmit={handleRedeemBackupCode}>
            <label>Backup code</label>
            <input
              required
              autoComplete="one-time-code"
              placeholder="XXXX-XXXX"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
            />
            {mfaError && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{mfaError}</p>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Verify"}
            </button>
          </form>
        ) : (
          <form className="card" onSubmit={handleVerifyTotp}>
            <label>6-digit code</label>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
            {mfaError && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{mfaError}</p>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Verify"}
            </button>
          </form>
        )}
        <p className="hint" style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setMfaError("");
            }}
            style={{ background: "none", border: "none", color: "var(--grey)", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}
          >
            {useBackupCode ? "Use your authenticator app instead" : "Lost your device? Use a backup code"}
          </button>
        </p>
      </div>
    );
  }

  if (recovery) {
    return (
      <div style={{ padding: 24, maxWidth: 400, margin: "60px auto 0" }}>
        <h1 style={{ fontSize: 22, textAlign: "center" }}>Foster Carer Log</h1>
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
      <h1 style={{ fontSize: 22, textAlign: "center" }}>Foster Carer Log</h1>
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
