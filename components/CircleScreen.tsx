"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "pending" | "accepted" | "declined";
type ConnectionRow = { id: string; requester_id: string; recipient_id: string; status: Status; created_at: string };
type ProfileLite = { id: string; display_name: string };
type MessageRow = { id: string; connection_id: string; sender_id: string; body: string; created_at: string };

// Simple refresh-based inbox, not live chat: messages reload on open,
// on manual refresh, and whenever the tab regains focus -- the same
// pattern EntriesScreen.tsx already uses for its own data. No
// websockets/polling infrastructure.
export default function CircleScreen() {
  const supabase = createClient();
  const [myId, setMyId] = useState("");
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestMsg, setRequestMsg] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);

    const { data: conns } = await supabase
      .from("connections")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (conns as ConnectionRow[]) ?? [];
    setConnections(rows);

    const otherIds = Array.from(
      new Set(rows.map((c) => (c.requester_id === user.id ? c.recipient_id : c.requester_id))),
    );
    if (otherIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", otherIds);
      const map: Record<string, string> = {};
      ((profs as ProfileLite[]) ?? []).forEach((p) => (map[p.id] = p.display_name || "(no name)"));
      setPeople(map);
    }
    setLoading(false);
  }

  async function loadMessages(connectionId: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connectionId)
      .order("created_at", { ascending: true });
    setMessages((data as MessageRow[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      load();
      if (openId) loadMessages(openId);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function sendRequest() {
    if (!email.trim()) return;
    setSendingRequest(true);
    setRequestMsg("");
    try {
      const res = await fetch("/api/connections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setRequestMsg(data.error);
        return;
      }
      setRequestMsg(`Request sent to ${email.trim()}.`);
      setEmail("");
      load();
    } catch {
      setRequestMsg("Couldn't send that — check your connection and try again.");
    } finally {
      setSendingRequest(false);
    }
  }

  async function accept(id: string) {
    await supabase.from("connections").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function removeConnection(id: string) {
    await supabase.from("connections").delete().eq("id", id);
    if (openId === id) setOpenId(null);
    load();
  }

  async function openThread(id: string) {
    setOpenId(id);
    await loadMessages(id);
  }

  async function send() {
    if (!draft.trim() || !openId) return;
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({ connection_id: openId, sender_id: myId, body });
    if (!error) loadMessages(openId);
  }

  const incoming = connections.filter((c) => c.status === "pending" && c.recipient_id === myId);
  const outgoing = connections.filter((c) => c.status === "pending" && c.requester_id === myId);
  const accepted = connections.filter((c) => c.status === "accepted");
  const otherOf = (c: ConnectionRow) => (c.requester_id === myId ? c.recipient_id : c.requester_id);
  const openConn = connections.find((c) => c.id === openId) || null;

  if (loading) return <div className="card">Loading…</div>;

  return (
    <div>
      <div className="card">
        <h3>Connect with someone</h3>
        <p className="hint">
          Both sides have to agree before you can message each other — e.g. your Mockingbird hub carer or another
          carer in your circle, even if they use their own separate household on this app.
        </p>
        <div className="row">
          <input
            type="email"
            placeholder="their@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" style={{ flex: "0 0 auto" }} disabled={sendingRequest || !email.trim()} onClick={sendRequest}>
            {sendingRequest ? "Sending…" : "Send request"}
          </button>
        </div>
        {requestMsg && <p className="note" style={{ marginTop: 8 }}>{requestMsg}</p>}
      </div>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="card">
          <h3>Requests</h3>
          {incoming.map((c) => (
            <div key={c.id} className="rec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>
                <b>{people[otherOf(c)] || "Someone"}</b> wants to connect with you
              </span>
              <span style={{ flex: "0 0 auto" }}>
                <button className="chip on" onClick={() => accept(c.id)}>Accept</button>{" "}
                <button className="chip" onClick={() => removeConnection(c.id)}>Decline</button>
              </span>
            </div>
          ))}
          {outgoing.map((c) => (
            <div key={c.id} className="rec" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>
                Waiting for <b>{people[otherOf(c)] || "them"}</b> to accept
              </span>
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => removeConnection(c.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Your circle</h3>
        {accepted.length === 0 && <p className="empty">No connections yet — send a request above to start one.</p>}
        {accepted.map((c) => (
          <div
            key={c.id}
            className="rec"
            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: openId === c.id ? "#fbfaf6" : undefined }}
            onClick={() => openThread(c.id)}
          >
            <b>{people[otherOf(c)] || "(no name)"}</b>
            <button
              className="chip"
              style={{ flex: "0 0 auto" }}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove ${people[otherOf(c)] || "this connection"} from your circle?`)) removeConnection(c.id);
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {openConn && (
        <div className="card" style={{ border: "2px solid var(--accent)" }}>
          <div className="row" style={{ alignItems: "center" }}>
            <h3 style={{ flex: 1, margin: 0 }}>{people[otherOf(openConn)] || "Conversation"}</h3>
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => loadMessages(openConn.id)}>
              ↻ Refresh
            </button>
            <button className="x" onClick={() => setOpenId(null)}>×</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", margin: "10px 0" }}>
            {messages.length === 0 && <p className="empty">No messages yet — say hello.</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  textAlign: m.sender_id === myId ? "right" : "left",
                  margin: "6px 0",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: m.sender_id === myId ? "var(--accent)" : "#f0efe9",
                    color: m.sender_id === myId ? "#fff" : "inherit",
                    maxWidth: "80%",
                  }}
                >
                  {m.body}
                </span>
                <br />
                <small className="muted">
                  {new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </small>
              </div>
            ))}
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <textarea
              rows={2}
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn" style={{ flex: "0 0 auto", width: "auto", alignSelf: "flex-end" }} disabled={!draft.trim()} onClick={send}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
