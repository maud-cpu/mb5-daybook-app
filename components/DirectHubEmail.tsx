"use client";

import { useState } from "react";
import { BUCKETS, Bucket } from "@/lib/types";

// Ticking "Send directly to X" used to route through the full Compose
// email screen -- pick a tone, type something to say, wait for an AI
// draft -- when the whole point was that the entry itself already says
// everything. This skips straight to exactly that: the entry's own text,
// ready to send, editable but with nothing left to write first.
export default function DirectHubEmail({
  hubName,
  hubEmail,
  childName,
  text,
  bucket,
  date,
  onClose,
}: {
  hubName: string;
  hubEmail: string;
  childName?: string;
  text: string;
  bucket: Bucket;
  date: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(`${childName ? childName + " — " : ""}${BUCKETS[bucket]}, ${date}`);
  const [body, setBody] = useState(text);

  function send() {
    window.location.href = `mailto:${encodeURIComponent(hubEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onClose();
  }

  return (
    <div className="card" style={{ border: "2px solid var(--accent)" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <h3 style={{ flex: 1, margin: 0 }}>Send to {hubName}</h3>
        <button className="x" onClick={onClose}>
          ×
        </button>
      </div>
      {!hubEmail ? (
        <p className="note" style={{ color: "var(--danger)" }}>
          No email on file for {hubName} yet — add one in About us, then this can be sent directly.
        </p>
      ) : (
        <>
          <p className="hint">
            This goes to {hubEmail} exactly as shown — edit anything first if you want to, or just send it.
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            Subject
          </p>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <p className="hint" style={{ marginTop: 8 }}>
            Message
          </p>
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn" style={{ marginTop: 10 }} onClick={send}>
            Send in your mail app ↗
          </button>
        </>
      )}
      <button className="btn quiet" style={{ marginTop: 8 }} onClick={onClose}>
        Skip
      </button>
    </div>
  );
}
