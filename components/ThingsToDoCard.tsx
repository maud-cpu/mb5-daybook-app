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
  unreportedIncidentItems,
} from "@/lib/thingsToDo";
import { FLAGS, Reminder, relatedFormFor } from "@/lib/types";

type FollowUp = {
  id: string;
  bucket: string;
  child: string;
  text: string;
  flag: string;
  flag_note: string;
  training_note: string;
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

export default function ThingsToDoCard() {
  const supabase = createClient();
  const [due, setDue] = useState<DueItem[]>([]);
  const [allReminders, setAllReminders] = useState<Reminder[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [doneFollowUps, setDoneFollowUps] = useState<DoneFollowUp[]>([]);
  const [doneReminders, setDoneReminders] = useState<Reminder[]>([]);
  const [dismissedDue, setDismissedDue] = useState<DismissedDue[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
      supabase.from("children").select("id, name, born, family, basics"),
      // A child in "Children in your household" can be an actual foster
      // placement too, not just the carer's own/adopted/kinship child --
      // they need the same missing-CSW/GP/duty-line nudges as any other.
      supabase.from("household_children").select("id, name, born, basics"),
      supabase.from("household").select("edt").maybeSingle(),
      supabase.from("carer_settings").select("invoice_day, pay_day").maybeSingle(),
      supabase.from("shared_training_catalog").select("title").eq("group_key", "3yr").eq("archived", false),
      supabase.from("training_progress").select("course_title, completed_on"),
      supabase.from("reminders").select("*").order("date"),
      supabase.from("records").select("id, bucket, child, text, flag, flag_note, training_note").eq("flag_done", false),
      supabase
        .from("records")
        .select("id, bucket, child, text, flag, flag_note, training_note, flag_done_at, flag_dismissed")
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
    setDue(
      [
        ...unreportedIncidentItems(incidents ?? []),
        ...invoiceMonthItems(settings?.invoice_day ?? 1, settings?.pay_day ?? 28, !!unpaidClaimed?.length),
        ...bandChangeItems(allChildren),
        ...trainingItems,
        ...missingNumbersItems(allChildren),
        ...edtMissingItem(household?.edt ?? ""),
        ...dueReminders(remindersList),
      ].filter((x) => !dismissedKeys.has(dismissKeyFor(x.key))),
    );
    setDismissedDue(dismissedList);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // The documents & forms reference below is always useful, even with an
  // empty list, so this only waits for the initial load rather than hiding
  // the whole card whenever there's nothing currently due.
  if (!loaded) return null;

  const anyUrgent = due.some((x) => x.urgent) || followUps.some((f) => FLAGS[f.flag as keyof typeof FLAGS]?.urgent);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${anyUrgent ? "var(--danger)" : "var(--marker)"}` }}>
      <h3>Things to do{anyUrgent ? " ⚠" : ""}</h3>

      {due.map((x) => {
        // A "fill this in" item (missing basics for a child) points at where to
        // actually go do it. Every other item is just informational -- reading
        // it should never remove it; only the explicit Dismiss/Done button does.
        const goTo = x.key.startsWith("nums-") ? "/dashboard/about" : null;
        return (
          <div key={x.key} className="rec" style={x.urgent ? { color: "var(--danger)" } : undefined}>
            {goTo ? <Link href={goTo}>{x.text}</Link> : <span>{x.text}</span>}
            <button className="chip" style={{ marginLeft: 8 }} onClick={() => dismissDue(x)}>
              {x.key.startsWith("rem-") ? "Done" : "Dismiss"}
            </button>
          </div>
        );
      })}
      {allReminders.length > 0 && (
        <p className="muted">
          Tap a reminder to add it to your phone calendar for an alert:{" "}
          <button className="chip" onClick={downloadIcs}>
            calendar file
          </button>
        </p>
      )}

      {followUps.map((f) => {
        const open = openId === f.id;
        const urgent = FLAGS[f.flag as keyof typeof FLAGS]?.urgent;
        const relatedForm = relatedFormFor(f.flag);
        return (
          <div
            key={f.id}
            className="rec"
            style={urgent ? { color: "var(--danger)" } : undefined}
            onClick={() => setOpenId(open ? null : f.id)}
          >
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
        );
      })}

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
