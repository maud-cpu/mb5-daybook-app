"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";
import { HUB_SUPPORT_TYPES } from "@/lib/types";
import { confirmUseExisting, findPersonByName } from "@/lib/findOrCreate";

const SUPPORT_TYPES = HUB_SUPPORT_TYPES;

function typeLabel(key: string): string {
  return SUPPORT_TYPES.find(([k]) => k === key)?.[1] || key;
}

type LogEntry = {
  id: string;
  date: string;
  carer_names: string;
  support_type: string;
  amount: number | null;
  notes: string;
};

// "Who's in your hub" is just a focused view onto household_visitors (the
// same adults shown on the About Us Visitors wheel) and the visiting
// children linked to them -- not a separate list, so adding someone here
// shows up there too and vice versa. See migration 0065.
type HubVisitor = { id: string; name: string; role: string };
type HubChild = { id: string; name: string; linked_visitor_id: string | null };

type Draft = { date: string; carer_names: string; support_type: string; amount: string; notes: string };

function blankDraft(): Draft {
  return { date: today(), carer_names: "", support_type: SUPPORT_TYPES[0][0], amount: "", notes: "" };
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function HubLogTab() {
  const supabase = createClient();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [visitors, setVisitors] = useState<HubVisitor[]>([]);
  const [hubChildren, setHubChildren] = useState<HubChild[]>([]);
  const [newVisitorName, setNewVisitorName] = useState("");
  const [newChildName, setNewChildName] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [range, setRange] = useState<"month" | "all">("month");

  async function load() {
    const [{ data }, { data: visitorRows }, { data: childRows }] = await Promise.all([
      supabase.from("hub_support_log").select("*").order("date", { ascending: false }),
      supabase.from("household_visitors").select("id, name, role").order("name"),
      supabase.from("children").select("id, name, linked_visitor_id").eq("lives_here", false),
    ]);
    setEntries((data as LogEntry[]) ?? []);
    setVisitors((visitorRows as HubVisitor[]) ?? []);
    setHubChildren((childRows as HubChild[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addVisitor() {
    const name = newVisitorName.trim();
    if (!name) return;
    const match = await findPersonByName(supabase, "household_visitors", name);
    if (match && confirmUseExisting(match.name)) {
      setNewVisitorName("");
      return;
    }
    await supabase.from("household_visitors").insert({ name, role: "Mockingbird hub carer" });
    setNewVisitorName("");
    load();
  }

  async function removeVisitor(id: string) {
    setVisitors((prev) => prev.filter((v) => v.id !== id));
    await supabase.from("household_visitors").delete().eq("id", id);
  }

  async function addChildFor(visitorId: string) {
    const name = (newChildName[visitorId] || "").trim();
    if (!name) return;
    const match = await findPersonByName(supabase, "children", name);
    if (match && confirmUseExisting(match.name)) {
      // Already on file, just not linked to this carer yet -- link the
      // existing child instead of creating a second row for the same kid.
      await supabase.from("children").update({ linked_visitor_id: visitorId }).eq("id", match.id);
      setNewChildName((prev) => ({ ...prev, [visitorId]: "" }));
      load();
      return;
    }
    await supabase.from("children").insert({ name, lives_here: false, category: "", linked_visitor_id: visitorId });
    setNewChildName((prev) => ({ ...prev, [visitorId]: "" }));
    load();
  }

  async function removeHubChild(id: string) {
    setHubChildren((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("children").delete().eq("id", id);
  }

  const thisMonth = today().slice(0, 7);
  const shown = range === "month" ? entries.filter((e) => e.date.startsWith(thisMonth)) : entries;

  // A running tally per support type -- exactly the shape the MB5 support-
  // log spreadsheet wants (a count or an hours total per type per month) --
  // so filling that in later is a copy, not a recount from scratch.
  const summary: Record<string, { count: number; total: number; hasAmount: boolean }> = {};
  shown.forEach((e) => {
    const s = (summary[e.support_type] ||= { count: 0, total: 0, hasAmount: false });
    s.count += 1;
    if (e.amount != null) {
      s.total += e.amount;
      s.hasAmount = true;
    }
  });

  async function add() {
    if (!draft.notes.trim() && !draft.carer_names.trim()) return;
    await supabase.from("hub_support_log").insert({
      date: draft.date,
      carer_names: draft.carer_names.trim(),
      support_type: draft.support_type,
      amount: draft.amount ? Number(draft.amount) : null,
      notes: draft.notes.trim(),
    });
    setDraft(blankDraft());
    load();
  }

  function startEdit(e: LogEntry) {
    setEditingId(e.id);
    setEditDraft({
      date: e.date,
      carer_names: e.carer_names,
      support_type: e.support_type,
      amount: e.amount != null ? String(e.amount) : "",
      notes: e.notes,
    });
  }

  async function saveEdit(id: string) {
    if (!editDraft) return;
    await supabase
      .from("hub_support_log")
      .update({
        date: editDraft.date,
        carer_names: editDraft.carer_names.trim(),
        support_type: editDraft.support_type,
        amount: editDraft.amount ? Number(editDraft.amount) : null,
        notes: editDraft.notes.trim(),
      })
      .eq("id", id);
    setEditingId(null);
    setEditDraft(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this entry?")) return;
    await supabase.from("hub_support_log").delete().eq("id", id);
    load();
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="card">
        <h3>Who&apos;s in your hub</h3>
        <p className="hint">
          Adding someone here adds them to the About Us Visitors circle too, and vice versa — one list, shown both
          places. Add a carer&apos;s children underneath them so a note naming a child still counts as that carer&apos;s
          hub news. Anyone here gets picked up automatically when you mention them in Capture. Prune anything you
          don&apos;t want once you&apos;re doing your spreadsheet, easier than checking beforehand.
        </p>
        {visitors.map((v) => {
          const kids = hubChildren.filter((c) => c.linked_visitor_id === v.id);
          return (
            <div key={v.id} style={{ marginTop: 8 }}>
              <div className="chips">
                <button className="chip on" onClick={() => removeVisitor(v.id)} title="Remove">
                  {v.name} ×
                </button>
                {kids.map((c) => (
                  <button key={c.id} className="chip" onClick={() => removeHubChild(c.id)} title="Remove">
                    {c.name} ×
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <input
                  placeholder={`Add ${v.name.split(" ")[0]}'s child…`}
                  value={newChildName[v.id] || ""}
                  onChange={(e) => setNewChildName((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addChildFor(v.id)}
                />
                <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => addChildFor(v.id)}>
                  + Add
                </button>
              </div>
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Add a hub carer (e.g. Sophie)"
            value={newVisitorName}
            onChange={(e) => setNewVisitorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addVisitor()}
          />
          <button className="chip" style={{ flex: "0 0 auto" }} onClick={addVisitor}>
            + Add
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Log a hub interaction</h3>
        <p className="hint">
          A quick record of support you&apos;ve given or received across your Mockingbird hub — a coffee catch-up,
          daycare cover, a sleepover, a social get-together, a constellation meeting. Kept here, shared with anyone
          else in your household, so a month&apos;s worth is easy to look back over when your support-log
          spreadsheet is due.
        </p>
        <div className="row">
          <input
            type="date"
            style={{ flex: "0 0 150px" }}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
          <select value={draft.support_type} onChange={(e) => setDraft({ ...draft, support_type: e.target.value })}>
            {SUPPORT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input
          placeholder="Carer(s) involved — e.g. Sophie, or 'the whole hub'"
          value={draft.carer_names}
          onChange={(e) => setDraft({ ...draft, carer_names: e.target.value })}
        />
        <input
          type="number"
          step="0.5"
          placeholder="Hours/count (optional — add later if easier)"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        />
        <textarea
          placeholder="What happened — e.g. &quot;Sophie came for coffee today to tackle admin&quot;, &quot;A bunch of us met for coffee and catch up at Mercers Lake&quot;"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
        <button className="btn" onClick={add}>
          Add to log
        </button>
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 10 }}>
          <button className={range === "month" ? "on" : ""} onClick={() => setRange("month")}>
            This month
          </button>
          <button className={range === "all" ? "on" : ""} onClick={() => setRange("all")}>
            All time
          </button>
        </div>

        {Object.keys(summary).length > 0 && (
          <div className="note" style={{ marginBottom: 10 }}>
            <b>Totals{range === "month" ? " this month" : ""}</b>
            {SUPPORT_TYPES.filter(([k]) => summary[k]).map(([k, l]) => {
              const s = summary[k];
              return (
                <div key={k} style={{ marginTop: 4 }}>
                  {l}: {s.count} entr{s.count === 1 ? "y" : "ies"}
                  {s.hasAmount ? ` — ${s.total}` : ""}
                </div>
              );
            })}
          </div>
        )}

        {shown.length === 0 && <p className="empty">Nothing logged {range === "month" ? "this month" : "yet"}.</p>}
        {shown.map((e) =>
          editingId === e.id && editDraft ? (
            <div className="item" key={e.id} style={{ marginBottom: 10 }}>
              <div className="row">
                <input
                  type="date"
                  style={{ flex: "0 0 150px" }}
                  value={editDraft.date}
                  onChange={(ev) => setEditDraft({ ...editDraft, date: ev.target.value })}
                />
                <select value={editDraft.support_type} onChange={(ev) => setEditDraft({ ...editDraft, support_type: ev.target.value })}>
                  {SUPPORT_TYPES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <input value={editDraft.carer_names} onChange={(ev) => setEditDraft({ ...editDraft, carer_names: ev.target.value })} />
              <input
                type="number"
                step="0.5"
                value={editDraft.amount}
                onChange={(ev) => setEditDraft({ ...editDraft, amount: ev.target.value })}
              />
              <textarea value={editDraft.notes} onChange={(ev) => setEditDraft({ ...editDraft, notes: ev.target.value })} />
              <div style={{ marginTop: 6 }}>
                <button className="chip" onClick={() => saveEdit(e.id)}>
                  Save
                </button>{" "}
                <button className="chip" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rec" key={e.id}>
              <button className="del" onClick={() => remove(e.id)}>
                ×
              </button>
              <span onClick={() => startEdit(e)} style={{ cursor: "pointer" }}>
                {e.notes || typeLabel(e.support_type)}
              </span>
              <br />
              <small>
                {fmtDate(e.date)} · {typeLabel(e.support_type)}
                {e.carer_names ? " · " + e.carer_names : ""}
                {e.amount != null ? " · " + e.amount : ""}
              </small>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
