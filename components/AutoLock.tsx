"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// A shared/family device left open on this app is a real risk -- it shows
// safeguarding, health and incident notes on real children. This locks the
// screen after a period with no interaction, without signing the carer out
// (which would lose an unsaved Capture draft) -- just a password re-check
// that clears once they're back.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"] as const;

export default function AutoLock({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const lastActivity = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));

    function markActive() {
      lastActivity.current = Date.now();
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive));

    function checkIdle() {
      if (Date.now() - lastActivity.current > IDLE_TIMEOUT_MS) {
        setLocked((prev) => prev || true);
      }
    }
    const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);
    // Catches a long spell with the tab backgrounded/device asleep, which a
    // setInterval alone can miss (most browsers throttle or pause timers in
    // a hidden tab) -- checked the moment it's foregrounded again instead.
    document.addEventListener("visibilitychange", checkIdle);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock() {
    setChecking(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setChecking(false);
    if (err) {
      setError("Wrong password — try again.");
      return;
    }
    setPassword("");
    lastActivity.current = Date.now();
    setLocked(false);
  }

  async function signOutInstead() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {children}
      {locked && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(32, 36, 28, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form
            className="card"
            style={{ maxWidth: 340, width: "100%" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (password) unlock();
            }}
          >
            <h3>🔒 Locked after inactivity</h3>
            <p className="hint">Enter your password to carry on where you left off — nothing unsaved has been lost.</p>
            <input
              type="password"
              autoFocus
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className="hint" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <button className="btn" type="submit" disabled={checking || !password}>
              {checking ? "Checking…" : "Unlock"}
            </button>
            <button type="button" className="btn quiet" onClick={signOutInstead}>
              Not you? Sign out
            </button>
          </form>
        </div>
      )}
    </>
  );
}
