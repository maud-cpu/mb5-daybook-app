"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "loading" | "off" | "enrolling" | "codes" | "on";

function downloadCodes(codes: string[]) {
  const text = `MB5 Day Book -- two-factor backup codes\nGenerated ${new Date().toLocaleDateString("en-GB")}\nEach code works once. Keep this somewhere safe.\n\n${codes.join("\n")}\n`;
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mb5-daybook-backup-codes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function TwoFactorCard() {
  const supabase = createClient();
  const [status, setStatus] = useState<Status>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStatus("on");
      const res = await fetch("/api/mfa/backup-codes");
      const body = await res.json();
      setRemaining(body.remaining ?? 0);
    } else {
      setStatus("off");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError("");
    setBusy(true);
    // A half-finished attempt from earlier (reloaded the page after
    // scanning but before entering the code, tried "Turn on" twice) can
    // leave an unverified factor behind with a different secret to whatever
    // QR is now on screen -- scanning the new one but still holding the old
    // entry in the authenticator app looks exactly like "wrong code" every
    // time. Clearing any unverified factors first means the QR shown is
    // always the only one that can possibly be right.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const stale = existing?.totp?.filter((f) => f.status !== "verified") ?? [];
    await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
    // Supabase rejects a new factor whose friendly name collides with an
    // existing one for this user -- every factor here previously left that
    // name blank, so a leftover from an earlier attempt (one the cleanup
    // above couldn't remove, e.g. it was already verified) blocked every
    // later attempt with the exact same "already exists" error. A name
    // that's different every time can never collide.
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `totp-${Date.now()}` });
    setBusy(false);
    if (err || !data) {
      setError(err?.message || "Couldn't start setup — try again.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStatus("enrolling");
  }

  async function cancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setFactorId(null);
    setQrCode("");
    setSecret("");
    setCode("");
    setError("");
    setStatus("off");
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError("");
    setBusy(true);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !challenge) {
      setBusy(false);
      setError(chErr?.message || "Couldn't check that code — try again.");
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    if (vErr) {
      setBusy(false);
      setError("That code wasn't right — try again. If it keeps failing, check your phone's clock is set to automatic/network time (a code that's even a little out of sync with the server will never match).");
      return;
    }
    const res = await fetch("/api/mfa/backup-codes", { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Two-factor is on, but couldn't generate backup codes — try regenerating them below.");
      setStatus("on");
      setRemaining(0);
      return;
    }
    setNewCodes(body.codes);
    setCode("");
    setStatus("codes");
  }

  function finishSetup() {
    setNewCodes([]);
    setStatus("on");
    setMsg("Two-factor authentication is on.");
    setTimeout(() => setMsg(""), 3000);
    fetch("/api/mfa/backup-codes")
      .then((r) => r.json())
      .then((b) => setRemaining(b.remaining ?? 0));
  }

  async function regenerateCodes() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/mfa/backup-codes", { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Couldn't generate new codes — try again.");
      return;
    }
    setNewCodes(body.codes);
    setStatus("codes");
  }

  async function turnOff() {
    if (!factorId) return;
    if (!confirm("Turn off two-factor authentication? You can turn it back on any time.")) return;
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    await fetch("/api/mfa/backup-codes", { method: "DELETE" });
    setBusy(false);
    setFactorId(null);
    setRemaining(null);
    setStatus("off");
    setMsg("Two-factor authentication is off.");
    setTimeout(() => setMsg(""), 3000);
  }

  if (status === "loading") {
    return (
      <div className="card">
        <h3>Two-factor authentication</h3>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (status === "off") {
    return (
      <div className="card">
        <h3>Two-factor authentication</h3>
        <p className="note">
          Currently off. Turning it on means signing in needs your password AND a code from an authenticator app
          (like Google Authenticator or Authy) on your phone — much harder for anyone else to get into your account
          even if they somehow learned your password.
        </p>
        {msg && <p className="hint">{msg}</p>}
        {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
        <button className="btn" onClick={startEnroll} disabled={busy}>
          {busy ? "Starting…" : "Turn on two-factor authentication"}
        </button>
      </div>
    );
  }

  if (status === "enrolling") {
    return (
      <div className="card">
        <h3>Set up two-factor authentication</h3>
        <p className="note">
          Scan this with an authenticator app (Google Authenticator, Authy, or similar), then enter the 6-digit code
          it shows you.
        </p>
        {qrCode && (
          // Supabase returns a ready-to-use SVG data URI here.
          <img src={qrCode} alt="Scan with your authenticator app" style={{ width: 180, height: 180, margin: "8px auto", display: "block" }} />
        )}
        {secret && (
          <p className="hint" style={{ textAlign: "center", wordBreak: "break-all" }}>
            Can&apos;t scan? Enter this code manually: <b>{secret}</b>
          </p>
        )}
        <form onSubmit={activate}>
          <label>6-digit code</label>
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Activate"}
            </button>
            <button className="chip" type="button" onClick={cancelEnroll}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (status === "codes") {
    return (
      <div className="card">
        <h3>Save your backup codes</h3>
        <p className="note" style={{ color: "#a66d00" }}>
          ⚠ These are shown only once. If you ever lose your phone, one of these gets you back in — each works once.
          Save or print them somewhere safe before continuing.
        </p>
        <pre id="rep" style={{ fontSize: 15, letterSpacing: 0.5 }}>
          {newCodes.join("\n")}
        </pre>
        <div className="row">
          <button className="chip" onClick={() => downloadCodes(newCodes)}>
            Download as a text file
          </button>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={finishSetup}>
          I&apos;ve saved these — done
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Two-factor authentication</h3>
      <p className="note">✓ Two-factor authentication is on.</p>
      {msg && <p className="hint">{msg}</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
      <p className="hint">
        {remaining ?? "…"} backup code{remaining === 1 ? "" : "s"} remaining.
        {remaining !== null && remaining <= 2 && " Running low — worth regenerating a fresh set."}
      </p>
      <div className="row">
        <button className="chip" onClick={regenerateCodes} disabled={busy}>
          Regenerate backup codes
        </button>
        <button className="chip" onClick={turnOff} disabled={busy}>
          Turn off two-factor
        </button>
      </div>
    </div>
  );
}
