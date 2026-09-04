"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trainingStatus } from "@/lib/domain";
import {
  DueItem,
  bandChangeItems,
  dueReminders,
  edtMissingItem,
  invoiceMonthItems,
  missingNumbersItems,
  unreportedIncidentItems,
  upcomingReminders,
} from "@/lib/thingsToDo";
import { Child, FLAGS, Reminder } from "@/lib/types";

type FollowUp = {
  id: string;
  bucket: string;
  child: string;
  text: string;
  flag: string;
  flag_note: string;
  training_note: string;
};

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
  const [upcoming, setUpcoming] = useState<Reminder[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [
      { data: incidents },
      { data: children },
      { data: household },
      { data: settings },
      { data: courses },
      { data: progress },
      { data: reminders },
      { data: openRecords },
    ] = await Promise.all([
      supabase.from("records").select("id, text, created_at, reported").eq("bucket", "incident"),
      supabase.from("children").select("id, name, born, family, basics"),
      supabase.from("household").select("edt").maybeSingle(),
      supabase.from("carer_settings").select("invoice_day, pay_day").maybeSingle(),
      supabase.from("shared_training_catalog").select("title").eq("group_key", "3yr").eq("archived", false),
      supabase.from("training_progress").select("course_title, completed_on"),
      supabase.from("reminders").select("*").order("date"),
      supabase.from("records").select("id, bucket, child, text, flag, flag_note, training_note").eq("flag_done", false),
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

    setDue([
      ...unreportedIncidentItems(incidents ?? []),
      ...invoiceMonthItems(settings?.invoice_day ?? 1, settings?.pay_day ?? 28, !!unpaidClaimed?.length),
      ...bandChangeItems((children as Child[]) ?? []),
      ...trainingItems,
      ...missingNumbersItems((children as (Child & { basics: Record<string, string> })[]) ?? []),
      ...edtMissingItem(household?.edt ?? ""),
      ...dueReminders(remindersList),
    ]);
    setUpcoming(upcomingReminders(remindersList));
    setFollowUps(
      ((openRecords as FollowUp[] | null) ?? []).filter((r) => (r.flag && r.flag !== "reminder") || r.training_note),
    );
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addReminder() {
    if (!newText.trim() || !newDate) return;
    await supabase.from("reminders").insert({ text: newText.trim(), date: newDate });
    setNewText("");
    setNewDate("");
    load();
  }

  async function doneReminder(key: string) {
    if (!key.startsWith("rem-")) return;
    const id = key.slice(4);
    await supabase.from("reminders").update({ done: true, done_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  async function markFollowUpDone(id: string) {
    await supabase.from("records").update({ flag_done: true, flag_done_at: new Date().toISOString() }).eq("id", id);
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
  }

  if (!loaded || (!due.length && !upcoming.length && !followUps.length)) return null;

  const anyUrgent = due.some((x) => x.urgent) || followUps.some((f) => FLAGS[f.flag as keyof typeof FLAGS]?.urgent);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${anyUrgent ? "var(--danger)" : "var(--marker)"}` }}>
      <h3>Things to do{anyUrgent ? " ⚠" : ""}</h3>
      {due.map((x) => (
        <div
          key={x.key}
          className="rec"
          style={x.urgent ? { color: "var(--danger)" } : undefined}
          onClick={() => doneReminder(x.key)}
        >
          {x.text}
          {x.key.startsWith("rem-") && <small> (tap when done)</small>}
        </div>
      ))}
      {upcoming.slice(0, 3).map((r) => (
        <div className="rec" style={{ opacity: 0.7 }} key={r.id}>
          {new Date(r.date + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — {r.text}
        </div>
      ))}
      <div className="row">
        <input
          placeholder="Add a reminder (e.g. CLA review, meds, training renewal)"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <input type="date" style={{ flex: "0 0 140px" }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <button className="chip" style={{ flex: "0 0 auto" }} onClick={addReminder}>
          Add
        </button>
      </div>

      {followUps.map((f) => {
        const open = openId === f.id;
        const urgent = FLAGS[f.flag as keyof typeof FLAGS]?.urgent;
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
                <button className="chip on" onClick={() => markFollowUpDone(f.id)}>
                  Mark done
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
