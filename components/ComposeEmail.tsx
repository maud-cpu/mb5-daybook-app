"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractEmail } from "@/lib/domain";
import { BUCKETS, Contact, EntryRecord, TONE_OPTIONS } from "@/lib/types";

type Recipient = { key: string; label: string; name: string; email: string };

export default function ComposeEmail({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [recipientOptions, setRecipientOptions] = useState<Recipient[]>([]);
  const [childNames, setChildNames] = useState<string[]>([]);
  const [records, setRecords] = useState<EntryRecord[]>([]);

  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [otherRecipientOn, setOtherRecipientOn] = useState(false);
  const [otherRecipient, setOtherRecipient] = useState({ name: "", email: "" });
  const [selectedKids, setSelectedKids] = useState<string[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [otherOn, setOtherOn] = useState(false);
  const [otherNote, setOtherNote] = useState("");
  const [note, setNote] = useState("");
  const [tone, setTone] = useState<string>(TONE_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: contacts }, { data: household }, { data: kids }, { data: recs }] = await Promise.all([
        supabase.from("contacts").select("id, label, name, phone, email"),
        supabase.from("household").select("ssw_name, ssw_email, ssw_manager_name, ssw_manager_email").maybeSingle(),
        supabase.from("children").select("name, basics"),
        supabase.from("records").select("*").order("created_at", { ascending: false }),
      ]);
      // Show everyone possible, even without an email on file yet -- a name
      // is enough to appear in the draft ("Dear Rhodri...") and be reminded
      // to fill the email in later.
      const opts: Recipient[] =
        (contacts as Contact[] | null)?.map((c) => ({ key: "c:" + c.id, label: c.label || "Contact", name: c.name, email: c.email || "" })) ?? [];
      if (household?.ssw_name) opts.push({ key: "h:ssw", label: "SSW", name: household.ssw_name, email: household.ssw_email || "" });
      if (household?.ssw_manager_name)
        opts.push({ key: "h:sswm", label: "SSW's manager", name: household.ssw_manager_name, email: household.ssw_manager_email || "" });
      (kids as { name: string; basics: Record<string, string> }[] | null)?.forEach((c) => {
        const csw = c.basics?.csw?.trim();
        if (csw) opts.push({ key: "csw:" + c.name, label: `${c.name}'s CSW`, name: csw.split(" — ")[0], email: extractEmail(csw) });
      });
      setRecipientOptions(opts);
      setChildNames((kids ?? []).map((k: { name: string }) => k.name));
      setRecords((recs as EntryRecord[]) ?? []);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);
  }

  const relevantRecords = selectedKids.length
    ? records.filter((r) => selectedKids.some((k) => r.child === k || r.kids.includes(k)))
    : [];

  const selectedRecipientObjs = [
    ...recipientOptions.filter((o) => selectedRecipients.includes(o.key)),
    ...(otherRecipientOn && otherRecipient.name.trim() ? [{ key: "other", label: "Other", name: otherRecipient.name.trim(), email: otherRecipient.email.trim() }] : []),
  ];

  async function draftEmail() {
    if (!note.trim() && !selectedEntries.length && !otherNote.trim()) {
      setError("Add something to say, or pick an entry, first");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/compose-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: selectedRecipientObjs,
        childNames: selectedKids,
        entryIds: selectedEntries,
        otherNote,
        note,
        tone,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) setError(data.error);
    else setDraft({ subject: data.subject, body: data.body });
  }

  const toEmails = selectedRecipientObjs.map((r) => r.email).filter(Boolean);

  function copyText() {
    if (!draft) return;
    const names = selectedRecipientObjs.map((r) => r.name || r.label);
    const t = (names.length ? "To: " + names.join(", ") + "\n" : "") + "Subject: " + draft.subject + "\n\n" + draft.body;
    navigator.clipboard.writeText(t).then(
      () => setCopyMsg("Copied — paste into a new email"),
      () => setCopyMsg("Couldn't copy"),
    );
    setTimeout(() => setCopyMsg(""), 2000);
  }

  return (
    <div className="card" style={{ border: "2px solid var(--accent)" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <h3 style={{ flex: 1, margin: 0 }}>Compose email</h3>
        <button className="x" onClick={onClose}>
          ×
        </button>
      </div>

      <h4 style={{ margin: "14px 0 4px", color: "var(--accent)" }}>Who to</h4>
      <div className="chips">
        {recipientOptions.length === 0 && <span className="muted">Nobody set up yet — add contacts in About us, or use Other below.</span>}
        {recipientOptions.map((o) => (
          <button
            key={o.key}
            className={`chip${selectedRecipients.includes(o.key) ? " on" : ""}`}
            onClick={() => toggle(selectedRecipients, setSelectedRecipients, o.key)}
          >
            {o.label}
            {o.name ? " — " + o.name : ""}
            {!o.email && " (no email yet)"}
          </button>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", marginTop: 4 }}>
        <input type="checkbox" style={{ flex: "0 0 auto" }} checked={otherRecipientOn} onChange={(e) => setOtherRecipientOn(e.target.checked)} />
        <span>Other — someone not listed</span>
      </label>
      {otherRecipientOn && (
        <div className="row">
          <input placeholder="Name" value={otherRecipient.name} onChange={(e) => setOtherRecipient({ ...otherRecipient, name: e.target.value })} />
          <input
            type="email"
            placeholder="Email (if known)"
            value={otherRecipient.email}
            onChange={(e) => setOtherRecipient({ ...otherRecipient, email: e.target.value })}
          />
        </div>
      )}

      <h4 style={{ margin: "14px 0 4px", color: "var(--accent)" }}>Who&apos;s this about?</h4>
      <div className="chips">
        {childNames.map((n) => (
          <button key={n} className={`chip${selectedKids.includes(n) ? " on" : ""}`} onClick={() => toggle(selectedKids, setSelectedKids, n)}>
            {n}
          </button>
        ))}
      </div>

      {selectedKids.length > 0 && (
        <>
          <h4 style={{ margin: "14px 0 4px", color: "var(--accent)" }}>Which entries to draw on</h4>
          {relevantRecords.length === 0 && <p className="empty">No entries for them yet.</p>}
          {relevantRecords.map((r) => (
            <label key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ marginTop: 4, flex: "0 0 auto" }}
                checked={selectedEntries.includes(r.id)}
                onChange={() => toggle(selectedEntries, setSelectedEntries, r.id)}
              />
              <span style={{ flex: 1 }}>
                <small className="muted">
                  {r.date} · {BUCKETS[r.bucket]}
                </small>
                <br />
                {r.text.slice(0, 110)}
              </span>
            </label>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" style={{ flex: "0 0 auto" }} checked={otherOn} onChange={(e) => setOtherOn(e.target.checked)} />
            <span>Other — something not in an entry</span>
          </label>
          {otherOn && <textarea placeholder="What else should go in?" value={otherNote} onChange={(e) => setOtherNote(e.target.value)} />}
        </>
      )}

      <h4 style={{ margin: "14px 0 4px", color: "var(--accent)" }}>Roughly what you want to say</h4>
      <textarea placeholder="A few words is enough — I'll write it up properly" value={note} onChange={(e) => setNote(e.target.value)} />

      <h4 style={{ margin: "14px 0 4px", color: "var(--accent)" }}>Tone</h4>
      <select value={tone} onChange={(e) => setTone(e.target.value)}>
        {TONE_OPTIONS.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 8 }}>{error}</p>}
      <button className="btn" onClick={draftEmail} disabled={busy}>
        {busy ? "Drafting…" : "Draft email"}
      </button>

      {draft && (
        <div className="card" style={{ border: "2px solid var(--marker)", marginTop: 14 }}>
          <p className="note" style={{ background: "#fdf3d9" }}>
            ⚠ This is a first draft, written by AI from what you gave it. Read it fully and personalise it before sending anything.
          </p>
          {selectedRecipientObjs.some((r) => !r.email) && (
            <p className="note" style={{ background: "#fdf3d9" }}>
              No email on file yet for: {selectedRecipientObjs.filter((r) => !r.email).map((r) => r.name || r.label).join(", ")}. Add it in About us,
              or send to them separately.
            </p>
          )}
          <p className="hint">Subject</p>
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <p className="hint" style={{ marginTop: 8 }}>
            Body — edit freely
          </p>
          <textarea rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div style={{ marginTop: 10 }}>
            <p className="hint">Send</p>
            {toEmails.length ? (
              <a
                className="chip"
                href={`mailto:${encodeURIComponent(toEmails.join(","))}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
              >
                Open in mail app
              </a>
            ) : (
              <span className="muted">No email address to send to yet — add one above, or use Copy.</span>
            )}{" "}
            <button className="chip" onClick={copyText}>
              Copy email text
            </button>
            {copyMsg && <span className="hint"> {copyMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
