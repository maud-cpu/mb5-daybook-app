"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today, trainingStatus } from "@/lib/domain";
import {
  DueItem,
  bandChangeItems,
  dueReminders,
  edtMissingItem,
  invoiceMonthItems,
  missingNumbersItems,
  placementEndItems,
  unreportedIncidentItems,
} from "@/lib/thingsToDo";
import { FLAGS, Reminder, relatedFormFor } from "@/lib/types";
import { linkify } from "@/lib/linkify";

type FollowUp = {
  id: string;
  bucket: string;
  child: string;
  text: string;
  flag: string;
  flag_note: string;
  training_note: string;
  created_at: string;
};

type DoneFollowUp = FollowUp & { flag_done_at: string; flag_dismissed: boolean };
type DismissedDue = { key: string; text: string; dismissed_at: string };

// inv-monthend/inv-send/payday recur every month with the same key -- dismiss
// them for THIS month only, not forever, so next month's nudge still shows.
const RECURRING_DUE_KEYS = ["inv-monthend", "inv-send", "payday"];
function dismissKeyFor(key: string): string {
  return RECURRING_DUE_KEYS.includes(key) ? `${key}:${today().slice(0, 7)}` : key;
}

function followUpLabel(f: FollowUp): string {
  if (f.flag && f.flag in FLAGS) return FLAGS[f.flag as keyof typeof FLAGS].label;
  return "Training suggestion";
}

function followUpIcon(f: FollowUp): string {
  if (f.flag === "training" || (!f.flag && f.training_note)) return "💡";
  if (f.flag === "reminder") return "🔔";
  return "⚠";
}

function followUpGuidance(f: FollowUp): string {
  if (f.flag && FLAGS[f.flag as keyof typeof FLAGS]?.guidance) return FLAGS[f.flag as keyof typeof FLAGS].guidance;
  return f.flag_note;
}

export default function ThingsToDoCard({ refreshKey }: { refreshKey?: number } = {}) {
  const supabase = createClient();
  const [due, setDue] = useState<DueItem[]>([]);
  const [allReminders, setAllReminders] = useState<Reminder[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [doneFollowUps, setDoneFollowUps] = useState<DoneFollowUp[]>([]);
  const [doneReminders, setDoneReminders] = useState<Reminder[]>([]);
  const [dismissedDue, setDismissedDue] = useState<DismissedDue[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [firstSeen, setFirstSeen] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // So a health-flagged follow-up ("book a GP appointment") can show the
  // child's actual GP contact right there, instead of sending the carer off
  // to go find it on About us separately.
  const [gpByChildName, setGpByChildName] = useState<Record<string, string>>({});

  async function load() {
    const [
      { data: incidents },
      { data: children },
      { data: householdChildren },
      { data: household },
      { data: settings },
      { data: courses },
      { data: progress },
      { data: reminders },
      { data: openRecords },
      { data: closedRecords },
      { data: dismissed },
    ] = await Promise.all([
      supabase.from("records").select("id, text, created_at, reported").eq("bucket", "incident"),
      supabase.from("children").select("id, name, born, family, basics, placement_end_date"),
      // A child in "Children in your household" can be an actual foster
      // placement too, not just the carer's own/adopted/kinship child --
      // they need the same missing-CSW/GP/duty-line nudges as any other.
      supabase.from("household_children").select("id, name, born, basics"),
      supabase.from("household").select("edt").maybeSingle(),
      supabase.from("carer_settings").select("invoice_day, pay_day").maybeSingle(),
      supabase.from("shared_training_catalog").select("title").eq("group_key", "3yr").eq("archived", false),
      supabase.from("training_progress").select("course_title, completed_on"),
      supabase.from("reminders").select("*").order("date"),
      supabase
        .from("records")
        .select("id, bucket, child, text, flag, flag_note, training_note, created_at")
        .eq("flag_done", false),
      supabase
        .from("records")
        .select("id, bucket, child, text, flag, flag_note, training_note, created_at, flag_done_at, flag_dismissed")
        .eq("flag_done", true)
        .order("flag_done_at", { ascending: false })
        .limit(20),
      supabase.from("dismissed_todos").select("key, text, dismissed_at").order("dismissed_at", { ascending: false }).limit(20),
    ]);
    const { data: unpaidClaimed } = await supabase
      .from("records")
      .select("id")
      .eq("bucket", "expenses")
      .eq("claimed", true)
      .eq("paid", false)
      .limit(1);

    const progressMap: Record<string, string> = {};
    (progress ?? []).forEach((p: { course_title: string; completed_on: string }) => (progressMap[p.course_title] = p.completed_on));
    const trainingItems: DueItem[] = (courses ?? [])
      .map((c: { title: string }) => ({ title: c.title, status: trainingStatus(true, progressMap[c.title]) }))
      .filter((x) => x.status.s === "over" || x.status.s === "soon")
      .map((x) => ({ key: "train-" + x.title, urgent: x.status.s === "over", text: `Training: ${x.title} — ${x.status.label}` }));

    const remindersList = (reminders as Reminder[]) ?? [];
    const dismissedList = (dismissed as DismissedDue[] | null) ?? [];
    const dismissedKeys = new Set(dismissedList.map((d) => d.key));

    const allChildren = [...(children ?? []), ...(householdChildren ?? [])];
    const gpMap: Record<string, string> = {};
    allChildren.forEach((c) => {
      if (c.basics?.gp) gpMap[c.name] = c.basics.gp;
    });
    setGpByChildName(gpMap);
    const dueList = [
      ...unreportedIncidentItems(incidents ?? []),
      ...invoiceMonthItems(settings?.invoice_day ?? 1, settings?.pay_day ?? 28, !!unpaidClaimed?.length),
      ...bandChangeItems(allChildren),
      ...trainingItems,
      ...missingNumbersItems(allChildren),
      ...placementEndItems(children ?? []),
      ...edtMissingItem(household?.edt ?? ""),
      ...dueReminders(remindersList),
    ].filter((x) => !dismissedKeys.has(dismissKeyFor(x.key)));
    setDue(dueList);
    setDismissedDue(dismissedList);

    // Nothing here had any record of how long it had actually been sitting
    // there -- which is exactly what made the list feel like the same wall
    // of nagging every day. Record the first date each key is ever seen
    // (ignoreDuplicates leaves an existing row alone), then read it back so
    // the render below can split "new today" from "been there a while".
    const dueKeys = dueList.map((x) => dismissKeyFor(x.key));
    if (dueKeys.length) {
      await supabase.from("todo_first_seen").upsert(
        dueKeys.map((k) => ({ key: k })),
        { onConflict: "user_id,key", ignoreDuplicates: true },
      );
      const { data: seenRows } = await supabase.from("todo_first_seen").select("key, first_seen").in("key", dueKeys);
      const seenMap: Record<string, string> = {};
      (seenRows ?? []).forEach((r: { key: string; first_seen: string }) => (seenMap[r.key] = r.first_seen));
      setFirstSeen(seenMap);
    } else {
      setFirstSeen({});
    }
    setAllReminders(remindersList.filter((r) => !r.done));
    setFollowUps(
      ((openRecords as FollowUp[] | null) ?? []).filter((r) => (r.flag && r.flag !== "reminder") || r.training_note),
    );
    setDoneFollowUps(
      ((closedRecords as DoneFollowUp[] | null) ?? []).filter((r) => (r.flag && r.flag !== "reminder") || r.training_note),
    );
    setDoneReminders(
      remindersList.filter((r) => r.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || "")).slice(0, 20),
    );
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount, and again whenever the caller bumps refreshKey (e.g. right after Capture saves something)
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function dismissDue(item: DueItem) {
    if (item.key.startsWith("rem-")) {
      const id = item.key.slice(4);
      await supabase.from("reminders").update({ done: true, done_at: new Date().toISOString() }).eq("id", id);
    } else {
      await supabase
        .from("dismissed_todos")
        .upsert({ key: dismissKeyFor(item.key), text: item.text }, { onConflict: "user_id,key" });
    }
    load();
  }

  async function reopenDue(key: string) {
    await supabase.from("dismissed_todos").delete().eq("key", key);
    load();
  }

  function downloadIcs() {
    if (!allReminders.length) return;
    const ics =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MB5 Day Book//EN\r\n" +
      allReminders
        .map(
          (r) =>
            `BEGIN:VEVENT\r\nUID:${r.id}@mb5\r\nDTSTART;VALUE=DATE:${r.date.replace(/-/g, "")}\r\nSUMMARY:${r.text}\r\nBEGIN:VALARM\r\nTRIGGER:-PT9H\r\nACTION:DISPLAY\r\nDESCRIPTION:${r.text}\r\nEND:VALARM\r\nEND:VEVENT`,
        )
        .join("\r\n") +
      "\r\nEND:VCALENDAR\r\n";
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mb5-reminders.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function markFollowUpDone(id: string) {
    await supabase
      .from("records")
      .update({ flag_done: true, flag_done_at: new Date().toISOString(), flag_dismissed: false })
      .eq("id", id);
    load();
  }

  async function dismissFollowUp(id: string) {
    await supabase
      .from("records")
      .update({ flag_done: true, flag_done_at: new Date().toISOString(), flag_dismissed: true })
      .eq("id", id);
    load();
  }

  async function reopenFollowUp(id: string) {
    await supabase.from("records").update({ flag_done: false, flag_done_at: null, flag_dismissed: false }).eq("id", id);
    load();
  }

  async function reopenReminder(id: string) {
    await supabase.from("reminders").update({ done: false, done_at: null }).eq("id", id);
    load();
  }

  // A skeleton card rather than nothing at all -- so this box holds its
  // place in the Capture page's 2x2 grid instead of the layout jumping once
  // it finishes loading.
  if (!loaded) {
    return (
      <div className="card">
        <h3>Things to do</h3>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const anyUrgent = due.some((x) => x.urgent) || followUps.some((f) => FLAGS[f.flag as keyof typeof FLAGS]?.urgent);

  // A "medical" reminder (a GP/dentist/hospital appointment to book) is the
  // exact moment the child's GP contact from About us is actually useful --
  // keyed by the same "rem-<id>" key dueReminders() uses, so it can be
  // looked up per due item without changing DueItem's shape.
  const medicalGpForKey: Record<string, string> = {};
  allReminders
    .filter((r) => r.category === "medical" && r.people[0] && gpByChildName[r.people[0]])
    .forEach((r) => (medicalGpForKey["rem-" + r.id] = gpByChildName[r.people[0]]));

  // Missing CSW/GP/duty-line details and a missing EDT number are safeguarding
  // basics that only ever leave this list once the field is actually filled
  // in -- so they used to sit permanently at the top, "new" or not, and that
  // was exactly the nagging she kept coming back to say was stressing her
  // out. They now never appear in the un-collapsed part of the list at all --
  // they're admin housekeeping, not a today-shaped task -- and live only in
  // "Been on your list a while" like everything else that's been sitting
  // around, however long they've actually been outstanding.
  const isEssential = (x: DueItem) => x.key.startsWith("nums-") || x.key === "edt";
  const essentialDue = due.filter(isEssential);
  const routineDue = due.filter((x) => !isEssential(x));

  // The whole point of this split: nothing distinguished "this just appeared"
  // from "this has been sitting here for weeks", which is exactly what made
  // the list feel like the same nagging wall every day. New today stays right
  // in view; anything older is tucked behind a tap instead of repeating.
  // A reminder (key "rem-...") is different from the open-ended admin
  // nagging items below it -- it's something the carer specifically asked
  // to be reminded about on/after a given date, so it should keep showing
  // every day until it's actually ticked off, not get tucked away into
  // "Been on your list a while" the moment it's no longer brand new.
  const isNewDue = (x: DueItem) => x.key.startsWith("rem-") || firstSeen[dismissKeyFor(x.key)] === today();
  const isNewFollowUp = (f: FollowUp) => f.created_at?.slice(0, 10) === today();
  const newRoutine = routineDue.filter(isNewDue);
  const newFollowUps = followUps.filter(isNewFollowUp);

  // Once there's nothing new today, the order of what's left matters --
  // most-recently-appeared first, so the top of the list is still the
  // freshest thing to look at rather than whatever order the underlying
  // queries happened to return.
  const byFirstSeenDesc = (a: DueItem, b: DueItem) =>
    (firstSeen[dismissKeyFor(b.key)] || "").localeCompare(firstSeen[dismissKeyFor(a.key)] || "");
  const olderEssential = [...essentialDue].sort(byFirstSeenDesc);
  const olderRoutine = routineDue.filter((x) => !isNewDue(x)).sort(byFirstSeenDesc);
  const olderFollowUps = followUps.filter((f) => !isNewFollowUp(f)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const olderCount = olderEssential.length + olderRoutine.length + olderFollowUps.length;

  function renderEssential(x: DueItem) {
    return (
      <div key={x.key} className="rec" style={x.urgent ? { color: "var(--danger)" } : undefined}>
        <Link href="/dashboard/about">{x.text}</Link>
      </div>
    );
  }

  function renderDue(x: DueItem) {
    const gp = medicalGpForKey[x.key];
    const open = openId === x.key;
    return (
      <div
        key={x.key}
        className="rec"
        style={{ display: "flex", alignItems: "flex-start", gap: 8, ...(x.urgent ? { color: "var(--danger)" } : {}) }}
      >
        <input
          type="checkbox"
          style={{ width: "auto", flex: "0 0 auto", marginTop: 3 }}
          checked={false}
          onChange={() => dismissDue(x)}
          title={x.key.startsWith("rem-") ? "Mark done" : "Dismiss"}
        />
        <span
          style={{ flex: 1, cursor: x.detail ? "pointer" : undefined }}
          onClick={x.detail ? () => setOpenId(open ? null : x.key) : undefined}
        >
          {x.text}
          {x.detail && <small className="muted">{open ? "" : " — tap for details"}</small>}
          {gp && (
            <>
              <br />
              <small className="muted">📞 GP: {gp}</small>
            </>
          )}
          {open && x.detail && (
            <div className="muted" style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>
              {linkify(x.detail)}
            </div>
          )}
        </span>
      </div>
    );
  }

  function renderFollowUp(f: FollowUp) {
    const open = openId === f.id;
    const urgent = FLAGS[f.flag as keyof typeof FLAGS]?.urgent;
    const relatedForm = relatedFormFor(f.flag);
    return (
      <div
        key={f.id}
        className="rec"
        style={{ display: "flex", alignItems: "flex-start", gap: 8, ...(urgent ? { color: "var(--danger)" } : {}) }}
      >
        <input
          type="checkbox"
          style={{ width: "auto", flex: "0 0 auto", marginTop: 3 }}
          checked={false}
          onChange={() => markFollowUpDone(f.id)}
          title="Mark done"
        />
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpenId(open ? null : f.id)}>
        <b>
          {followUpIcon(f)} {followUpLabel(f)}
        </b>
        {f.child ? " · " + f.child : ""} <small className="muted">{open ? "" : "— tap for details"}</small>
        {open && (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="muted" style={{ margin: "4px 0" }}>
              {f.text}
            </div>
            {followUpGuidance(f) && <div className="note">{followUpGuidance(f)}</div>}
            {f.flag === "health" && f.child && gpByChildName[f.child] && (
              <div className="note">📞 {f.child}&apos;s GP: {gpByChildName[f.child]}</div>
            )}
            {f.training_note && f.flag !== "training" && <div className="note">💡 {f.training_note}</div>}
            {relatedForm && (
              <div className="note">
                📄{" "}
                <a href={relatedForm.url} target="_blank" rel="noopener noreferrer">
                  {relatedForm.name} ↗
                </a>
              </div>
            )}
            <button className="chip on" onClick={() => markFollowUpDone(f.id)}>
              Mark done
            </button>{" "}
            <button className="chip" onClick={() => dismissFollowUp(f.id)}>
              Dismiss
            </button>
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderLeft: `4px solid ${anyUrgent ? "var(--danger)" : "var(--marker)"}` }}>
      <h3>Things to do{anyUrgent ? " ⚠" : ""}</h3>

      {newRoutine.map(renderDue)}
      {newFollowUps.map(renderFollowUp)}

      {allReminders.length > 0 && (
        <p className="muted">
          Tap a reminder to add it to your phone calendar for an alert:{" "}
          <button className="chip" onClick={downloadIcs}>
            calendar file
          </button>
        </p>
      )}

      {olderCount > 0 && (
        <>
          <p className="hint" style={{ marginTop: 10, cursor: "pointer" }} onClick={() => setShowOlder(!showOlder)}>
            {showOlder ? "▾" : "▸"} Been on your list a while ({olderCount}) — tap to {showOlder ? "hide" : "show"}
          </p>
          {showOlder && (
            <>
              {olderEssential.map(renderEssential)}
              {olderRoutine.map(renderDue)}
              {olderFollowUps.map(renderFollowUp)}
            </>
          )}
        </>
      )}

      {(doneFollowUps.length > 0 || doneReminders.length > 0 || dismissedDue.length > 0) && (
        <>
          <p className="hint" style={{ marginTop: 10, cursor: "pointer" }} onClick={() => setShowDone(!showDone)}>
            {showDone ? "▾" : "▸"} Recently done ({doneFollowUps.length + doneReminders.length + dismissedDue.length}) —
            tap to {showDone ? "hide" : "show"}
          </p>
          {showDone && (
            <>
              {dismissedDue.map((d) => (
                <div key={d.key} className="rec" style={{ opacity: 0.7, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {d.text}
                    <small className="muted">
                      {" "}
                      — dismissed {new Date(d.dismissed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </small>
                  </span>
                  <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => reopenDue(d.key)}>
                    Reopen
                  </button>
                </div>
              ))}
              {doneReminders.map((r) => (
                <div key={r.id} className="rec" style={{ opacity: 0.7, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    🔔 {r.text}
                    {r.done_at && (
                      <small className="muted">
                        {" "}
                        — done {new Date(r.done_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </small>
                    )}
                  </span>
                  <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => reopenReminder(r.id)}>
                    Reopen
                  </button>
                </div>
              ))}
              {doneFollowUps.map((f) => (
                <div key={f.id} className="rec" style={{ opacity: 0.7, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {followUpIcon(f)} {followUpLabel(f)}
                    {f.child ? " · " + f.child : ""}
                    {f.flag_done_at && (
                      <small className="muted">
                        {" "}
                        — {f.flag_dismissed ? "dismissed" : "done"}{" "}
                        {new Date(f.flag_done_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </small>
                    )}
                    <br />
                    <small className="muted">{f.text}</small>
                  </span>
                  <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => reopenFollowUp(f.id)}>
                    Reopen
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
