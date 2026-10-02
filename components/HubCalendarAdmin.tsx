"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { REMINDER_CATEGORIES } from "@/lib/types";

type Candidate = { household_owner_id: string; display_name: string; is_hub_member: boolean };

type HubEvent = {
  id: string;
  title: string;
  body: string;
  date: string;
  time_from: string | null;
  time_to: string | null;
  url: string;
  category: string;
  created_at: string;
};

type Draft = { title: string; body: string; date: string; time_from: string; time_to: string; url: string; category: string };

function blankDraft(): Draft {
  return { title: "", body: "", date: today(), time_from: "", time_to: "", url: "", category: REMINDER_CATEGORIES[0][0] };
}

// Pushes a dated item once and it lands directly on every flagged hub
// member's own calendar/Up next -- unlike News & Events (NewsAdmin), which
// every carer has to notice and add to their own calendar by hand. See
// 0083_hub_calendar.sql for the membership flag and push/sync functions
// this calls into.
export default function HubCalendarAdmin({ showToast }: { showToast: (msg: string) => void }) {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [{ data: cands, error: candErr }, { data: evs }] = await Promise.all([
      supabase.rpc("admin_hub_candidates"),
      supabase.from("shared_hub_events").select("*").order("date"),
    ]);
    if (candErr) showToast("Couldn't load hub members: " + candErr.message);
    setCandidates((cands as Candidate[] | null) ?? []);
    setEvents((evs as HubEvent[] | null) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleMember(c: Candidate) {
    setBusyId(c.household_owner_id);
    setCandidates((prev) =>
      prev.map((x) => (x.household_owner_id === c.household_owner_id ? { ...x, is_hub_member: !x.is_hub_member } : x)),
    );
    const { error } = await supabase.rpc("admin_set_hub_member", {
      p_household_owner_id: c.household_owner_id,
      p_is_member: !c.is_hub_member,
    });
    setBusyId(null);
    if (error) {
      showToast("Couldn't update: " + error.message);
      load();
      return;
    }
    showToast(c.is_hub_member ? `${c.display_name} removed from hub pushes` : `${c.display_name} will now get hub pushes`);
  }

  async function publish() {
    if (!draft.title.trim() || !draft.date) return;
    const { data, error } = await supabase
      .from("shared_hub_events")
      .insert({
        title: draft.title.trim(),
        body: draft.body.trim(),
        date: draft.date,
        time_from: draft.time_from || null,
        time_to: draft.time_to || null,
        url: draft.url.trim(),
        category: draft.category,
      })
      .select("id")
      .single();
    if (error) {
      showToast("Couldn't publish: " + error.message);
      return;
    }
    const { error: syncError } = await supabase.rpc("sync_hub_event", { p_event_id: data.id });
    if (syncError) showToast("Published, but couldn't push to everyone yet: " + syncError.message);
    else showToast("Pushed to every hub member's calendar");
    setAdding(false);
    setDraft(blankDraft());
    load();
  }

  function startEdit(e: HubEvent) {
    setEditingId(e.id);
    setEditDraft({
      title: e.title,
      body: e.body,
      date: e.date,
      time_from: e.time_from ?? "",
      time_to: e.time_to ?? "",
      url: e.url,
      category: e.category,
    });
  }

  async function saveEdit(id: string) {
    if (!editDraft || !editDraft.title.trim() || !editDraft.date) return;
    const { error } = await supabase
      .from("shared_hub_events")
      .update({
        title: editDraft.title.trim(),
        body: editDraft.body.trim(),
        date: editDraft.date,
        time_from: editDraft.time_from || null,
        time_to: editDraft.time_to || null,
        url: editDraft.url.trim(),
        category: editDraft.category,
      })
      .eq("id", id);
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    const { error: syncError } = await supabase.rpc("sync_hub_event", { p_event_id: id });
    if (syncError) showToast("Saved, but couldn't re-push the change: " + syncError.message);
    else showToast("Updated on every hub member's calendar");
    setEditingId(null);
    setEditDraft(null);
    load();
  }

  async function removeEvent(e: HubEvent) {
    if (!confirm(`Remove "${e.title}" from every hub member's calendar? This can't be undone.`)) return;
    const { error } = await supabase.from("shared_hub_events").delete().eq("id", e.id);
    if (error) {
      showToast("Couldn't remove: " + error.message);
      return;
    }
    setEvents((prev) => prev.filter((x) => x.id !== e.id));
    showToast("Removed from everyone's calendar");
  }

  if (!loaded) return null;

  return (
    <div className="card">
      <h3>Hub calendar</h3>
      <p className="hint">
        Push a dated item straight onto every flagged hub member&apos;s own calendar/Up next — no need for them to
        notice and add it themselves like News &amp; Events. Editing or removing it here updates or removes it
        everywhere it was pushed.
      </p>

      <h4 style={{ margin: "14px 0 4px" }}>Hub members</h4>
      {candidates.length === 0 && (
        <p className="empty">No other households share your content group yet — nobody to push to.</p>
      )}
      <div className="chips">
        {candidates.map((c) => (
          <button
            key={c.household_owner_id}
            className={`chip${c.is_hub_member ? " on" : ""}`}
            disabled={busyId === c.household_owner_id}
            onClick={() => toggleMember(c)}
          >
            {c.is_hub_member ? "✓ " : ""}
            {c.display_name}
          </button>
        ))}
      </div>

      <h4 style={{ margin: "14px 0 4px" }}>Events</h4>
      {events.map((e) =>
        editingId === e.id && editDraft ? (
          <div key={e.id} className="item" style={{ marginBottom: 10 }}>
            <input placeholder="Title" value={editDraft.title} onChange={(ev) => setEditDraft({ ...editDraft, title: ev.target.value })} />
            <textarea
              placeholder="Details"
              value={editDraft.body}
              onChange={(ev) => setEditDraft({ ...editDraft, body: ev.target.value })}
              style={{ marginTop: 6 }}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <input type="date" style={{ flex: "0 0 150px" }} value={editDraft.date} onChange={(ev) => setEditDraft({ ...editDraft, date: ev.target.value })} />
              <select value={editDraft.category} onChange={(ev) => setEditDraft({ ...editDraft, category: ev.target.value })}>
                {REMINDER_CATEGORIES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
              <span className="muted" style={{ flex: "0 0 auto" }}>
                Time (optional)
              </span>
              <input type="time" style={{ flex: "0 0 110px" }} value={editDraft.time_from} onChange={(ev) => setEditDraft({ ...editDraft, time_from: ev.target.value })} />
              <span className="muted" style={{ flex: "0 0 auto" }}>
                to
              </span>
              <input type="time" style={{ flex: "0 0 110px" }} value={editDraft.time_to} onChange={(ev) => setEditDraft({ ...editDraft, time_to: ev.target.value })} />
            </div>
            <input
              placeholder="Link (optional)"
              value={editDraft.url}
              onChange={(ev) => setEditDraft({ ...editDraft, url: ev.target.value })}
              style={{ marginTop: 6 }}
            />
            <div style={{ marginTop: 8 }}>
              <button className="chip on" onClick={() => saveEdit(e.id)}>
                Save &amp; re-push
              </button>{" "}
              <button
                className="chip"
                onClick={() => {
                  setEditingId(null);
                  setEditDraft(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={e.id} className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <span style={{ flex: 1, cursor: "pointer" }} onClick={() => startEdit(e)}>
              <b>{e.title}</b>
              <br />
              <small className="muted">
                {e.date}
                {e.time_from ? ` · ${e.time_from.slice(0, 5)}${e.time_to ? `–${e.time_to.slice(0, 5)}` : ""}` : ""}
                {e.body ? ` · ${e.body.slice(0, 80)}` : ""}
                {" · tap to edit"}
              </small>
            </span>
            <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => removeEvent(e)}>
              Remove
            </button>
          </div>
        ),
      )}
      {events.length === 0 && <p className="empty">Nothing pushed yet.</p>}

      {adding ? (
        <div className="item" style={{ marginTop: 10 }}>
          <input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea placeholder="Details (optional)" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} style={{ marginTop: 6 }} />
          <div className="row" style={{ marginTop: 6 }}>
            <input type="date" style={{ flex: "0 0 150px" }} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {REMINDER_CATEGORIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
            <span className="muted" style={{ flex: "0 0 auto" }}>
              Time (optional)
            </span>
            <input type="time" style={{ flex: "0 0 110px" }} value={draft.time_from} onChange={(e) => setDraft({ ...draft, time_from: e.target.value })} />
            <span className="muted" style={{ flex: "0 0 auto" }}>
              to
            </span>
            <input type="time" style={{ flex: "0 0 110px" }} value={draft.time_to} onChange={(e) => setDraft({ ...draft, time_to: e.target.value })} />
          </div>
          <input
            placeholder="Link (optional) — booking page, more info, a form…"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            style={{ marginTop: 6 }}
          />
          <div style={{ marginTop: 8 }}>
            <button className="chip on" onClick={publish} disabled={!draft.title.trim()}>
              Push to hub members
            </button>{" "}
            <button
              className="chip"
              onClick={() => {
                setAdding(false);
                setDraft(blankDraft());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="chip add" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
          + Push a hub event
        </button>
      )}
    </div>
  );
}
