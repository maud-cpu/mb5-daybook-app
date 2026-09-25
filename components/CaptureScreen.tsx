"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daycareAmount, gbp, today } from "@/lib/domain";
import { withAmazonAffiliateTag } from "@/lib/amazon";
import ThingsToDoCard from "@/components/ThingsToDoCard";
import NewsCard from "@/components/NewsCard";
import MiniCalendarCard from "@/components/MiniCalendarCard";
import TodaysEntriesCard from "@/components/TodaysEntriesCard";
import CaptureTrainingCard from "@/components/CaptureTrainingCard";
import PhotoField from "@/components/PhotoField";
import DirectHubEmail from "@/components/DirectHubEmail";
import {
  BUCKETS,
  Bucket,
  Child,
  DAYCARE_REASONS,
  EXPENSE_KINDS,
  FLAGS,
  HUB_SUPPORT_TYPES,
  PendingItem,
  Rates,
} from "@/lib/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 26 }, (_, i) => String(CURRENT_YEAR - i));
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// A child whose own Mockingbird hub is "mb5" (this household's own) has
// their hub_carer_* fields auto-filled from the household's own hub leader
// (see mockingbirdHubPatch in AboutScreen.tsx) -- so the same person can
// show up as both "your hub carer" and "this child's hub carer" on the
// same entry. Matching on email (the more reliable identifier when both
// are set) or name is what lets Capture offer just the one checkbox
// instead of two for the same send.
function sameHubCarer(c: { hub_carer_name: string; hub_carer_email: string }, hubLeader: { name: string; email: string }): boolean {
  const email = c.hub_carer_email.trim().toLowerCase();
  const leaderEmail = hubLeader.email.trim().toLowerCase();
  if (email && leaderEmail) return email === leaderEmail;
  const name = c.hub_carer_name.trim().toLowerCase();
  const leaderName = hubLeader.name.trim().toLowerCase();
  return !!name && !!leaderName && name === leaderName;
}

function openLabel(length: string): string {
  const medium = (length.split(/,|—/)[0] || "").trim().toLowerCase();
  if (medium === "book") return "Open book ↗";
  if (medium === "video") return "Open video ↗";
  if (medium === "podcast") return "Open podcast ↗";
  if (medium === "article") return "Open article ↗";
  return "Open course ↗";
}

export default function CaptureScreen() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [warning, setWarning] = useState("");
  // Things To Do and the training-suggestion card each load once on mount
  // and otherwise only refresh on a tab focus/visibility change -- while
  // staying on this same Capture page for a whole session (which is the
  // normal way this app gets used), a newly-flagged follow-up or a new
  // training suggestion just saved never actually appeared until the page
  // was reloaded. Bumping this after a successful save re-triggers both.
  const [captureVersion, setCaptureVersion] = useState(0);
  const [toast, setToast] = useState("");
  const [addFor, setAddFor] = useState<number | "top" | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildBornMonth, setNewChildBornMonth] = useState("");
  const [newChildBornYear, setNewChildBornYear] = useState("");
  const [newChildFamily, setNewChildFamily] = useState("");
  const [newChildKind, setNewChildKind] = useState<"household" | "visiting" | "other">("household");
  // Every child actually living in this household -- long term, short term,
  // birth, kinship, whatever the placement type -- shares the SAME hub as
  // the carer herself, so there's no per-child hub carer to ask for there;
  // this is that one shared contact, offered on every entry regardless of
  // which children (if any) it's tagged with, since the carer herself may
  // need her own hub carer looped in either way.
  const [hubLeader, setHubLeader] = useState<{ name: string; email: string } | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeQueue, setComposeQueue] = useState<
    { hubName: string; hubEmail: string; childName?: string; text: string; bucket: Bucket; date: string }[]
  >([]);
  const [courseInfo, setCourseInfo] = useState<Record<string, { url: string; length: string }>>({});
  // "Key contacts at school" (About us -> Education) is a repeatable list
  // stored as a JSON-array string inside children.basics.teacher /
  // household_children.basics.teacher -- not its own table -- so saving a
  // school contact from here has to read and write that same field, on
  // whichever of the two tables the child actually lives in.
  const [basicsByChildId, setBasicsByChildId] = useState<Record<string, Record<string, string>>>({});
  const [childTable, setChildTable] = useState<Record<string, "children" | "household_children">>({});
  const [clubsByChildId, setClubsByChildId] = useState<Record<string, { club_name: string }[]>>({});
  const [schoolAdminByChildId, setSchoolAdminByChildId] = useState<Record<string, Record<string, string>>>({});
  const [firstName, setFirstName] = useState("");

  async function loadClubs() {
    const { data } = await supabase.from("child_clubs").select("child_id, club_name");
    const map: Record<string, { club_name: string }[]> = {};
    (data ?? []).forEach((r: { child_id: string; club_name: string }) => {
      (map[r.child_id] ||= []).push({ club_name: r.club_name });
    });
    setClubsByChildId(map);
  }

  async function loadSchoolAdmin() {
    const { data } = await supabase.from("child_school_admin").select("*");
    const map: Record<string, Record<string, string>> = {};
    (data as (Record<string, string> & { child_id: string })[] | null)?.forEach((r) => {
      map[r.child_id] = r;
    });
    setSchoolAdminByChildId(map);
  }

  async function loadChildren() {
    const [{ data: visiting }, { data: household }] = await Promise.all([
      supabase.from("children").select("id, name, born, family, hub_carer_name, hub_carer_email, basics").order("created_at"),
      supabase.from("household_children").select("id, name, born, hub_carer_name, hub_carer_email, basics").order("created_at"),
    ]);
    // A child in the household (household_children) is sometimes an actual
    // foster placement too, not just the carer's own/adopted/kinship child --
    // they need to show up here to be tagged on entries the same as any
    // other child, so they're merged in rather than only offering the
    // separate "children" (visiting/placement) table.
    const visitingRows = (visiting as (Child & { basics: Record<string, string> })[]) ?? [];
    const householdRows = (household as (Child & { basics: Record<string, string> })[]) ?? [];
    setChildren([...visitingRows, ...householdRows.map((h) => ({ ...h, family: "" }))]);
    const basicsMap: Record<string, Record<string, string>> = {};
    const tableMap: Record<string, "children" | "household_children"> = {};
    visitingRows.forEach((c) => {
      basicsMap[c.id] = c.basics || {};
      tableMap[c.id] = "children";
    });
    householdRows.forEach((c) => {
      basicsMap[c.id] = c.basics || {};
      tableMap[c.id] = "household_children";
    });
    setBasicsByChildId(basicsMap);
    setChildTable(tableMap);
  }

  type TeacherContact = { name?: string; phone?: string; email?: string };
  function parseTeacherContacts(raw: string): TeacherContact[] {
    try {
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (raw) return [{ name: raw }];
    }
    return [];
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    loadChildren();
    loadClubs();
    loadSchoolAdmin();
    supabase
      .from("shared_rates")
      .select("*")
      .single()
      .then(({ data }) => setRates(data as Rates));
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setFirstName((data?.display_name || "").trim().split(/\s+/)[0] || ""));
    });
    supabase
      .from("household")
      .select("is_mockingbird, hub_leader_name, hub_leader_email")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.is_mockingbird && data.hub_leader_name) {
          setHubLeader({ name: data.hub_leader_name, email: data.hub_leader_email || "" });
        }
      });
    Promise.all([
      supabase.from("shared_training_catalog").select("title, platform, url, length"),
      supabase.from("shared_training_platforms").select("name, url"),
    ]).then(([{ data: courses }, { data: platforms }]) => {
      const urlByPlatform: Record<string, string> = {};
      (platforms ?? []).forEach((p: { name: string; url: string }) => (urlByPlatform[p.name] = p.url));
      const byCourse: Record<string, { url: string; length: string }> = {};
      (courses ?? []).forEach((c: { title: string; platform: string; url: string; length: string }) => {
        byCourse[c.title.trim().toLowerCase()] = {
          url: withAmazonAffiliateTag(c.url || urlByPlatform[c.platform] || ""),
          length: c.length || "",
        };
      });
      setCourseInfo(byCourse);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  function openAddChild(forItem: number | "top", prefillName = "") {
    setAddFor(forItem);
    setNewChildName(prefillName);
    setNewChildBornMonth("");
    setNewChildBornYear("");
    setNewChildFamily("");
    setNewChildKind("household");
  }

  function tagAddedName(addedName: string, rawName: string) {
    if (typeof addFor === "number") {
      setPending((prev) =>
        prev.map((p, idx) => {
          if (idx !== addFor) return p;
          const kids = p.kids.includes(addedName) ? p.kids : [...p.kids, addedName];
          const unmatched = (p.unmatched ?? []).filter((n) => n.toLowerCase() !== rawName.toLowerCase());
          return { ...p, kids, unmatched, child: p.child || addedName };
        }),
      );
    }
  }

  async function addChild() {
    const name = newChildName.trim();
    if (!name) return;

    // "Other" doesn't belong in `children` at all -- that table is for
    // someone this carer actually looks after, and a name just mentioned in
    // passing (another carer's sibling, a friend) isn't that. This just
    // tags the entry with the free-text name, same as typing anyone else's
    // name into a calendar entry's people picker -- no permanent record.
    if (newChildKind === "other") {
      tagAddedName(name, name);
      setNewChildName("");
      setNewChildBornMonth("");
      setNewChildBornYear("");
      setNewChildFamily("");
      setAddFor(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showToast("Couldn't add child: not signed in");
      return;
    }
    const born = newChildBornMonth && newChildBornYear ? `${newChildBornYear}-${newChildBornMonth}-01` : null;
    const { data, error } = await supabase
      .from("children")
      .insert({ user_id: user.id, name, born, family: newChildFamily.trim(), lives_here: newChildKind === "household" })
      .select("id, name, born, family")
      .single();
    if (error) {
      showToast("Couldn't add child: " + error.message);
      return;
    }
    await loadChildren();
    if (data) tagAddedName((data as Child).name, name);
    setNewChildName("");
    setNewChildBornMonth("");
    setNewChildBornYear("");
    setNewChildFamily("");
    setAddFor(null);
  }

  async function sortIt() {
    const text = cap.trim();
    if (!text) return;
    setBusy(true);
    setWarning("");
    try {
      const res = await fetch("/api/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error);
      } else {
        setPending(data.items ?? []);
        if (data.warning) setWarning(data.warning);
      }
    } catch {
      showToast("Couldn't reach the sorting service — try again in a moment.");
    }
    setBusy(false);
  }

  function updatePending(i: number, patch: Partial<PendingItem>) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function toggleKid(i: number, name: string) {
    setPending((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const kids = p.kids.includes(name) ? p.kids.filter((k) => k !== name) : [...p.kids, name];
        return { ...p, kids };
      }),
    );
  }

  function toggleSendHub(i: number, name: string) {
    setPending((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const send_hub = (p.send_hub ?? []).includes(name)
          ? (p.send_hub ?? []).filter((k) => k !== name)
          : [...(p.send_hub ?? []), name];
        return { ...p, send_hub };
      }),
    );
  }

  // Applies to every tagged child that needs it (e.g. two siblings sharing
  // the same teacher), not just one. This writes into the SAME "Key
  // contacts at school" repeatable list shown on About us -- adding a new
  // contact, or updating one already there with a matching name -- rather
  // than a separate field nobody would see. Reads and writes the full
  // basics object so nothing else already saved for that child is lost.
  async function saveSchoolContact(i: number, childNames: string[]) {
    const sc = pending[i].school_contact;
    if (!sc) return;
    const targets = childNames.map((n) => children.find((c) => c.name === n)).filter((c): c is Child => !!c);
    if (!targets.length) return;
    const isEmail = sc.contact.includes("@");
    for (const c of targets) {
      const basics = basicsByChildId[c.id] || {};
      const contacts = parseTeacherContacts(basics.teacher || "");
      const existingIdx = contacts.findIndex((ct) => (ct.name || "").trim().toLowerCase() === sc.name.trim().toLowerCase());
      const nextContact: TeacherContact = {
        name: sc.name,
        phone: isEmail ? contacts[existingIdx]?.phone || "" : sc.contact || contacts[existingIdx]?.phone || "",
        email: isEmail ? sc.contact : contacts[existingIdx]?.email || "",
      };
      const nextContacts = existingIdx >= 0 ? contacts.map((ct, idx) => (idx === existingIdx ? nextContact : ct)) : [...contacts, nextContact];
      const nextBasics = { ...basics, teacher: JSON.stringify(nextContacts) };
      const { error } = await supabase
        .from(childTable[c.id] || "children")
        .update({ basics: nextBasics })
        .eq("id", c.id);
      if (error) {
        showToast("Couldn't save: " + error.message);
        return;
      }
      setBasicsByChildId((prev) => ({ ...prev, [c.id]: nextBasics }));
    }
    updatePending(i, { school_contact: null });
    showToast(`Saved to ${childNames.join(" & ")}'s Key contacts at school`);
  }

  // A club is its own row per child (child_clubs has no natural key to
  // upsert on, unlike the single school-admin record per child), so this
  // inserts fresh rather than merging into an existing one -- the "already
  // on file" check above is what stops it creating a duplicate on a club
  // mentioned again another day.
  async function saveClub(i: number, childNames: string[]) {
    const club = pending[i].club;
    if (!club) return;
    const targets = childNames.map((n) => children.find((c) => c.name === n)).filter((c): c is Child => !!c);
    if (!targets.length) return;
    const weekday = Math.max(0, WEEKDAYS.indexOf(club.weekday));
    const { error } = await supabase.from("child_clubs").insert(
      targets.map((c) => ({
        child_id: c.id,
        club_name: club.name,
        weekday,
        time_from: club.timeFrom,
        time_to: club.timeTo,
        contact_name: club.provider,
        contact_info: club.contactInfo,
        cost: club.cost,
        website: club.website,
        notes: club.notes,
      })),
    );
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    setClubsByChildId((prev) => {
      const next = { ...prev };
      targets.forEach((c) => (next[c.id] = [...(next[c.id] || []), { club_name: club.name }]));
      return next;
    });
    updatePending(i, { club: null });
    showToast(`Saved to ${childNames.join(" & ")}'s Clubs`);
  }

  // Appends anything not already there, comma-separated, in the same
  // free-text Likes/Dislikes fields shown on About us -- not a merge-by-name
  // list like teacher contacts, since a food note has no natural key beyond
  // the food word itself, and a plain "already contains this word" check is
  // enough to stop the same dislike being added twice.
  async function saveFoodNote(i: number, childNames: string[]) {
    const note = pending[i].food_note;
    if (!note) return;
    const targets = childNames.map((n) => children.find((c) => c.name === n)).filter((c): c is Child => !!c);
    if (!targets.length) return;
    for (const c of targets) {
      const basics = basicsByChildId[c.id] || {};
      const append = (existing: string, addition: string) => {
        if (!addition) return existing;
        const items = existing.split(",").map((s) => s.trim()).filter(Boolean);
        addition
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((food) => {
            if (!items.some((it) => it.toLowerCase() === food.toLowerCase())) items.push(food);
          });
        return items.join(", ");
      };
      const nextBasics = {
        ...basics,
        food_likes: append(basics.food_likes || "", note.likes),
        food_dislikes: append(basics.food_dislikes || "", note.dislikes),
      };
      const { error } = await supabase
        .from(childTable[c.id] || "children")
        .update({ basics: nextBasics })
        .eq("id", c.id);
      if (error) {
        showToast("Couldn't save: " + error.message);
        return;
      }
      setBasicsByChildId((prev) => ({ ...prev, [c.id]: nextBasics }));
    }
    updatePending(i, { food_note: null });
    showToast(`Saved to ${childNames.join(" & ")}'s Food box`);
  }

  // Appended into the child's free-text "notes" box on School admin --
  // never overwrites anything, just adds this note if it isn't already
  // there (e.g. re-saving the same note twice from an edited capture).
  async function saveSchoolAdmin(i: number, childNames: string[]) {
    const note = (pending[i].school_admin_note || "").trim();
    if (!note) return;
    const targets = childNames.map((n) => children.find((c) => c.name === n)).filter((c): c is Child => !!c);
    if (!targets.length) return;
    for (const c of targets) {
      const existing = schoolAdminByChildId[c.id] || {};
      const existingNotes = existing.notes || "";
      if (existingNotes.includes(note)) continue;
      const next = { ...existing, notes: [existingNotes, note].filter(Boolean).join("\n") };
      const { error } = await supabase.from("child_school_admin").upsert({ child_id: c.id, ...next }, { onConflict: "child_id" });
      if (error) {
        showToast("Couldn't save: " + error.message);
        return;
      }
      setSchoolAdminByChildId((prev) => ({ ...prev, [c.id]: next }));
    }
    updatePending(i, { school_admin_note: "" });
    showToast(`Saved to ${childNames.join(" & ")}'s School admin notes`);
  }

  // Unlike food/school-admin notes, a hub update has no natural key to dedupe
  // against -- every one of these is its own moment worth its own row in the
  // Hub log, same as if it had been typed there directly.
  async function saveHubUpdate(i: number) {
    const update = pending[i].hub_update;
    if (!update) return;
    const { error } = await supabase.from("hub_support_log").insert({
      date: today(),
      carer_names: update.carer_names,
      support_type: update.support_type,
      notes: pending[i].text,
    });
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    updatePending(i, { hub_update: null });
    showToast("Saved to Hub log");
  }

  // Whether a tagged child still needs this suggestion applied -- shared
  // between the review screen (deciding what to show) and Save all (which
  // now applies every suggestion still showing, so a school contact/club/
  // food note can never be silently lost just because a second, separate
  // "Save" button wasn't noticed and clicked).
  function schoolContactNeeds(p: PendingItem): string[] {
    if (!p.school_contact) return [];
    return p.kids.filter((k) => {
      const c = children.find((ch) => ch.name === k);
      if (!c) return false;
      const contacts = parseTeacherContacts(basicsByChildId[c.id]?.teacher || "");
      return !contacts.some((ct) => (ct.name || "").trim().toLowerCase() === p.school_contact!.name.trim().toLowerCase());
    });
  }
  function clubNeeds(p: PendingItem): string[] {
    if (!p.club) return [];
    return p.kids.filter((k) => {
      const c = children.find((ch) => ch.name === k);
      if (!c) return false;
      return !(clubsByChildId[c.id] || []).some((cl) => cl.club_name.trim().toLowerCase() === p.club!.name.trim().toLowerCase());
    });
  }
  function foodNoteNeeds(p: PendingItem): string[] {
    if (!p.food_note) return [];
    const hasFood = (list: string, food: string) =>
      list
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .includes(food.trim().toLowerCase());
    return p.kids.filter((k) => {
      const c = children.find((ch) => ch.name === k);
      if (!c) return false;
      const basics = basicsByChildId[c.id] || {};
      const likes = p.food_note!.likes.split(",").map((s) => s.trim()).filter(Boolean);
      const dislikes = p.food_note!.dislikes.split(",").map((s) => s.trim()).filter(Boolean);
      return (
        likes.some((f) => !hasFood(basics.food_likes || "", f)) || dislikes.some((f) => !hasFood(basics.food_dislikes || "", f))
      );
    });
  }
  function schoolAdminNeeds(p: PendingItem): string[] {
    const note = (p.school_admin_note || "").trim();
    if (!note) return [];
    return p.kids.filter((k) => {
      const c = children.find((ch) => ch.name === k);
      if (!c) return false;
      const existing = schoolAdminByChildId[c.id] || {};
      return !(existing.notes || "").includes(note);
    });
  }

  async function saveAll() {
    if (!pending.length) return;
    const rows = pending.map((p) => ({
      bucket: p.bucket,
      child: p.kids[0] || "",
      kids: p.kids,
      also_in: p.also_in ?? [],
      text: p.text,
      date: today(),
      kind: p.bucket === "expenses" ? p.kind : null,
      amount: p.amount ?? null,
      miles: p.miles ?? null,
      hours: p.hours ?? null,
      time_from: p.time_from ?? null,
      time_to: p.time_to ?? null,
      overnight: !!p.overnight,
      reason: p.reason ?? "",
      med_name: p.med_name ?? "",
      dose: p.dose ?? "",
      given: p.given ?? null,
      given_by: p.given_by ?? "",
      flag: p.flag ?? "",
      flag_note: p.flag_note ?? "",
      training_note: p.training_note ?? "",
      shared_with_admin: !!p.shared_with_admin,
      photos: p.photos ?? [],
    }));
    const { data: inserted, error } = await supabase.from("records").insert(rows).select("id");
    if (error) {
      showToast("Couldn't save: " + error.message);
      return;
    }
    // A "remind me" note on its own was previously just tagged and then never
    // seen again -- nothing ever turned it into an actual calendar/Today
    // entry. It now also creates a real reminder for the date the carer
    // meant (or today, if they didn't give one).
    // A single one-off event affecting several children (e.g. "Ruby and
    // Rubynn's art class moved to Saturday") sometimes comes back from the
    // AI as one pending item per child rather than one item naming both --
    // merging same date+category+text items here before insert stops that
    // becoming two duplicate calendar entries instead of one with both names.
    const reminderGroups = new Map<string, { text: string; date: string; category: string; people: string[] }>();
    const reminderOrder: string[] = [];
    pending
      .filter((p) => p.flag === "reminder")
      .forEach((p) => {
        const text = p.flag_note || p.text;
        const date = p.reminder_date || today();
        const category = p.reminder_category || "personal";
        const key = [date, category, text.trim().toLowerCase()].join("|");
        let group = reminderGroups.get(key);
        if (!group) {
          group = { text, date, category, people: [] };
          reminderGroups.set(key, group);
          reminderOrder.push(key);
        }
        p.kids.forEach((k) => {
          if (k && !group!.people.includes(k)) group!.people.push(k);
        });
      });
    const reminderRows = reminderOrder.map((k) => reminderGroups.get(k)!);
    if (reminderRows.length) await supabase.from("reminders").insert(reminderRows);
    // Training the carer says they themselves did goes straight onto their
    // training record (Training & Resources / the Supervision report both
    // read training_progress) -- even when it isn't one of the courses in
    // the shared catalogue, same reasoning as reminders above: this is the
    // one chance to save it, so it's automatic, not a separate click.
    const completedTrainingRows = pending
      .map((p) => p.completed_training)
      .filter((t): t is { title: string; date: string } => !!t?.title)
      .map((t) => ({ course_title: t.title, completed_on: t.date }));
    if (completedTrainingRows.length) {
      await supabase.from("training_progress").upsert(completedTrainingRows, { onConflict: "user_id,course_title" });
    }
    // Day care given to another carer's children is, by its nature, hub
    // support -- logged to the Hub log too, not just Expenses, so it's
    // already there when the MB5 support-log spreadsheet is due rather than
    // needing to be typed in twice. carer_names comes from whichever cared-
    // for child already has a hub carer on file; left blank to fill in by
    // hand otherwise, same as anything else logged here.
    const daycareHubRows = pending
      .filter((p) => p.bucket === "expenses" && p.kind === "daycare")
      .map((p) => {
        const carerNames = [
          ...new Set(
            p.kids.map((k) => children.find((c) => c.name === k)?.hub_carer_name).filter((n): n is string => !!n && n.trim() !== ""),
          ),
        ];
        return {
          date: today(),
          carer_names: carerNames.join(", "),
          support_type: p.overnight ? (p.reason === "Emergency" ? "sleepover_emergency" : "sleepover_planned") : "daytime_child",
          amount: p.hours ?? null,
          notes: p.text,
        };
      });
    if (daycareHubRows.length) await supabase.from("hub_support_log").insert(daycareHubRows);
    // A school contact / club / food note shown as a suggestion is applied
    // automatically here -- not just on its own separate "Save" click --
    // because a click on a small secondary button, easy to miss under the
    // main "Save all", was exactly how a teacher's name got silently
    // dropped even though the diary entry itself saved fine. Editing or
    // dismissing a suggestion before hitting Save all still works as
    // before; this only fills the gap where neither was done.
    await Promise.all(
      pending.flatMap((p, idx) => {
        const jobs: Promise<void>[] = [];
        const scNeeds = schoolContactNeeds(p);
        if (scNeeds.length) jobs.push(saveSchoolContact(idx, scNeeds));
        const clNeeds = clubNeeds(p);
        if (clNeeds.length) jobs.push(saveClub(idx, clNeeds));
        const fnNeeds = foodNoteNeeds(p);
        if (fnNeeds.length) jobs.push(saveFoodNote(idx, fnNeeds));
        const saNeeds = schoolAdminNeeds(p);
        if (saNeeds.length) jobs.push(saveSchoolAdmin(idx, saNeeds));
        if (p.hub_update) jobs.push(saveHubUpdate(idx));
        return jobs;
      }),
    );
    showToast(`Saved ${rows.length} item${rows.length > 1 ? "s" : ""}`);
    setCaptureVersion((v) => v + 1);
    const d = today();
    const queue: { hubName: string; hubEmail: string; childName?: string; text: string; bucket: Bucket; date: string }[] = [];
    pending.forEach((p, idx) => {
      if (!inserted?.[idx]) return;
      (p.send_hub ?? []).forEach((childName) => {
        const c = children.find((ch) => ch.name === childName);
        if (c) {
          queue.push({ hubName: c.hub_carer_name || "their hub carer", hubEmail: c.hub_carer_email || "", childName, text: p.text, bucket: p.bucket, date: d });
        }
      });
      if (p.send_own_hub && hubLeader) {
        const matchedChild = p.kids.find((k) => {
          const c = children.find((ch) => ch.name === k);
          return c && sameHubCarer(c, hubLeader);
        });
        queue.push({ hubName: hubLeader.name, hubEmail: hubLeader.email, childName: matchedChild || p.kids[0], text: p.text, bucket: p.bucket, date: d });
      }
    });
    setPending([]);
    setCap("");
    if (queue.length) {
      setComposeQueue(queue);
      setComposing(true);
    }
  }

  function closeCompose() {
    const rest = composeQueue.slice(1);
    if (rest.length) {
      setComposeQueue(rest);
    } else {
      setComposing(false);
      setComposeQueue([]);
    }
  }

  const names = children.map((c) => c.name);

  function addChildForm() {
    return (
      <div style={{ marginTop: 8 }}>
        <input
          placeholder="Initials or first name"
          value={newChildName}
          onChange={(e) => setNewChildName(e.target.value)}
        />
        <div className="chips" style={{ marginTop: 6 }}>
          <button
            type="button"
            className={`chip${newChildKind === "household" ? " on" : ""}`}
            onClick={() => setNewChildKind("household")}
          >
            In your household
          </button>
          <button
            type="button"
            className={`chip${newChildKind === "visiting" ? " on" : ""}`}
            onClick={() => setNewChildKind("visiting")}
          >
            Visiting regularly
          </button>
          <button type="button" className={`chip${newChildKind === "other" ? " on" : ""}`} onClick={() => setNewChildKind("other")}>
            Everyone else
          </button>
        </div>
        {newChildKind === "other" ? (
          <>
            <p className="hint" style={{ marginTop: 4 }}>
              For a friend, sibling, or anyone else just mentioned in passing — just tags this note with their name,
              doesn&apos;t add them as a child you look after.
            </p>
            <button className="chip" style={{ marginTop: 4 }} onClick={addChild}>
              Add
            </button>
          </>
        ) : (
          <>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="muted" style={{ alignSelf: "center", flex: "0 0 auto" }}>
                Born
              </span>
              <select value={newChildBornMonth} onChange={(e) => setNewChildBornMonth(e.target.value)}>
                <option value="">Month</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </select>
              <select value={newChildBornYear} onChange={(e) => setNewChildBornYear(e.target.value)}>
                <option value="">Year</option>
                {BIRTH_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <input
                placeholder="Household / carer (e.g. Smiths)"
                value={newChildFamily}
                onChange={(e) => setNewChildFamily(e.target.value)}
              />
              <button className="chip" style={{ flex: "0 0 auto" }} onClick={addChild}>
                Add
              </button>
            </div>
            <p className="note">Just month and year is enough — we only need this to work out age bands, not their exact birthday.</p>
          </>
        )}
      </div>
    );
  }

  if (composing && composeQueue[0]) {
    return (
      <div>
        <DirectHubEmail onClose={closeCompose} {...composeQueue[0]} />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 12px" }}>
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h2>
      <div className="capture-top-grid">
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <h3>Tell me anything</h3>
          <textarea
            placeholder="A note, or a command — 'diary', 'supervision', 'expenses', 'social worker', 'incident', 'just record', or 'add parents evening to the calendar on the 12th'. Mileage and hours of day care get costed automatically."
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            style={{ flex: 1, minHeight: 200 }}
          />
          <button className="btn" disabled={busy || !cap.trim()} onClick={sortIt}>
            {busy ? "Sorting…" : "Sort it"}
          </button>
          <p className="hint">
            Children: {names.join(", ") || "none yet"}{" "}
            <button className="chip add" onClick={() => (addFor === "top" ? setAddFor(null) : openAddChild("top"))}>
              + child
            </button>
          </p>
          {addFor === "top" && addChildForm()}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <MiniCalendarCard />
          <NewsCard />
        </div>
      </div>

      {warning && <div className="note">{warning}</div>}

      {pending.length > 0 && (
        <div className="card">
          <h3>Check before saving</h3>
          {pending.map((p, i) => (
            <div className="item" key={i}>
              <div className="row">
                <select value={p.bucket} onChange={(e) => updatePending(i, { bucket: e.target.value as Bucket })}>
                  {Object.entries(BUCKETS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {p.bucket === "expenses" && (
                  <select value={p.kind ?? "purchase"} onChange={(e) => updatePending(i, { kind: e.target.value as PendingItem["kind"] })}>
                    {EXPENSE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k === "purchase" ? "Purchase" : k === "mileage" ? "Mileage" : "Day care"}
                      </option>
                    ))}
                  </select>
                )}
                {!p.hub_update && (
                  <button
                    className="chip"
                    style={{ flex: "0 0 auto" }}
                    title="Also log this to the Hub log"
                    onClick={() => updatePending(i, { hub_update: { carer_names: "", support_type: "other" } })}
                  >
                    + Hub news
                  </button>
                )}
                <button className="x" onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}>
                  ×
                </button>
              </div>

              {(p.unmatched ?? []).length > 0 && (
                <div className="note" style={{ color: "#a66d00" }}>
                  {p.unmatched!.map((n) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>⚠ &quot;{n}&quot; isn&apos;t registered yet — add them so this links up properly.</span>
                      <button
                        className="chip"
                        style={{ flex: "0 0 auto" }}
                        onClick={() => (addFor === i ? setAddFor(null) : openAddChild(i, n))}
                      >
                        + Register {n}
                      </button>
                    </div>
                  ))}
                  {addFor === i && addChildForm()}
                </div>
              )}

              {p.bucket !== "expenses" && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {names.map((n) => (
                    <button
                      key={n}
                      className={`chip${p.kids.includes(n) ? " on" : ""}`}
                      style={{ flex: "0 0 auto" }}
                      onClick={() => toggleKid(i, n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {p.bucket === "expenses" && p.kind === "mileage" && (
                <div className="row">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="miles"
                    value={p.miles ?? ""}
                    onChange={(e) => updatePending(i, { miles: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}

              {p.bucket === "expenses" && p.kind === "daycare" && (
                <>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    {names.map((n) => (
                      <button
                        key={n}
                        className={`chip${p.kids.includes(n) ? " on" : ""}`}
                        style={{ flex: "0 0 auto" }}
                        onClick={() => toggleKid(i, n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <input
                      type="time"
                      value={p.time_from ?? ""}
                      onChange={(e) => updatePending(i, { time_from: e.target.value || null })}
                    />
                    <input
                      type="time"
                      value={p.time_to ?? ""}
                      onChange={(e) => updatePending(i, { time_to: e.target.value || null })}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      placeholder="or hrs"
                      style={{ flex: "0 0 70px" }}
                      value={p.hours ?? ""}
                      onChange={(e) => updatePending(i, { hours: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                    <label style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={!!p.overnight}
                        onChange={(e) => updatePending(i, { overnight: e.target.checked })}
                      />
                      overnight
                    </label>
                  </div>
                  <div className="row">
                    <select value={p.reason || ""} onChange={(e) => updatePending(i, { reason: e.target.value })}>
                      <option value="">Reason for day care…</option>
                      {DAYCARE_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  {rates && (
                    <div className="calc">
                      {gbp(daycareAmount(rates, children, p as never))}
                      {!p.overnight && !p.time_from && !p.time_to && !p.hours && (
                        <span className="note" style={{ color: "#a66d00", display: "block", fontWeight: "normal" }}>
                          ⚠ No hours or times given yet, so this is £0.00 — add them above.
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {p.bucket === "expenses" && p.kind === "purchase" && (
                <div className="row">
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="£"
                    value={p.amount ?? ""}
                    onChange={(e) => updatePending(i, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}

              {p.bucket === "meds" && (
                <>
                  <div className="row">
                    <input
                      placeholder="Medicine"
                      value={p.med_name ?? ""}
                      onChange={(e) => updatePending(i, { med_name: e.target.value })}
                    />
                    <input
                      placeholder="Dose (e.g. 5ml, 1 tablet)"
                      value={p.dose ?? ""}
                      onChange={(e) => updatePending(i, { dose: e.target.value })}
                    />
                  </div>
                  <div className="row">
                    <input
                      type="time"
                      value={p.given ?? ""}
                      onChange={(e) => updatePending(i, { given: e.target.value || null })}
                    />
                    <input
                      placeholder="Given by"
                      value={p.given_by ?? ""}
                      onChange={(e) => updatePending(i, { given_by: e.target.value })}
                    />
                  </div>
                </>
              )}

              <textarea value={p.text} onChange={(e) => updatePending(i, { text: e.target.value })} />

              <PhotoField photos={p.photos ?? []} onChange={(next) => updatePending(i, { photos: next })} />

              <div className="row" style={{ alignItems: "center", marginTop: 4 }}>
                <span className="muted" style={{ flex: "0 0 auto" }}>
                  ⚠ Follow-up
                </span>
                <select
                  style={{ flex: 1 }}
                  value={p.flag || ""}
                  onChange={(e) => updatePending(i, { flag: e.target.value, flag_note: "" })}
                >
                  <option value="">None</option>
                  {Object.entries(FLAGS).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              {p.flag && (
                <div className="note">
                  {["reminder", "training"].includes(p.flag) ? (
                    <>
                      <textarea
                        placeholder={p.flag === "training" ? "Suggested course — edit if needed" : "What to remind you to do"}
                        value={p.flag_note ?? ""}
                        onChange={(e) => updatePending(i, { flag_note: e.target.value })}
                      />
                      {p.flag === "reminder" && (
                        <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
                          <span className="muted" style={{ flex: "0 0 auto" }}>
                            Remind me on
                          </span>
                          <input
                            type="date"
                            style={{ flex: "0 0 150px" }}
                            value={p.reminder_date || today()}
                            onChange={(e) => updatePending(i, { reminder_date: e.target.value })}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    FLAGS[p.flag as keyof typeof FLAGS]?.guidance
                  )}
                </div>
              )}
              {p.training_note &&
                p.training_note.split("\n").map((line, lineIdx) => {
                  const idx = line.indexOf(" — ");
                  const title = idx === -1 ? "" : line.slice(0, idx);
                  const info = title ? courseInfo[title.trim().toLowerCase()] : undefined;
                  return (
                    <div className="note" key={lineIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1 }}>
                        💡 {line}
                        {info?.length && <span className="muted"> ({info.length})</span>}
                        {info?.url && (
                          <>
                            {" "}
                            <a href={info.url} target="_blank" rel="noopener noreferrer">
                              {openLabel(info.length)}
                            </a>
                          </>
                        )}
                      </span>
                      <button
                        className="x"
                        style={{ flex: "0 0 auto" }}
                        title="Don't save this suggestion"
                        onClick={() =>
                          updatePending(i, {
                            training_note: p.training_note!
                              .split("\n")
                              .filter((_, idx2) => idx2 !== lineIdx)
                              .join("\n"),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              {p.completed_training && (
                <div className="note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ flex: 1 }}>
                    🎓 Attended: {p.completed_training.title} ({p.completed_training.date}) — saves to your training
                    record with this entry.
                  </span>
                  <button
                    className="x"
                    style={{ flex: "0 0 auto" }}
                    title="Don't save this to my training record"
                    onClick={() => updatePending(i, { completed_training: null })}
                  >
                    ×
                  </button>
                </div>
              )}
              {p.school_contact &&
                (() => {
                  const needsUpdate = schoolContactNeeds(p);
                  if (!needsUpdate.length) return null;
                  return (
                    <div className="note">
                      <div style={{ marginBottom: 6 }}>
                        📇 New school contact for {needsUpdate.join(" & ")} — check it&apos;s right (this saves automatically with
                        Save all):
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          placeholder="Name"
                          value={p.school_contact.name}
                          onChange={(e) => updatePending(i, { school_contact: { ...p.school_contact!, name: e.target.value } })}
                        />
                        <input
                          placeholder="Email/phone (optional)"
                          value={p.school_contact.contact}
                          onChange={(e) => updatePending(i, { school_contact: { ...p.school_contact!, contact: e.target.value } })}
                        />
                      </div>
                      <button className="chip" onClick={() => saveSchoolContact(i, needsUpdate)}>
                        Save now as {needsUpdate.join(" & ")}&apos;s teacher
                      </button>{" "}
                      <button className="chip" onClick={() => updatePending(i, { school_contact: null })}>
                        Don&apos;t save
                      </button>
                    </div>
                  );
                })()}
              {p.club &&
                (() => {
                  const needsClub = clubNeeds(p);
                  if (!needsClub.length) return null;
                  return (
                    <div className="note">
                      <div style={{ marginBottom: 6 }}>
                        🧩 New club for {needsClub.join(" & ")} — check it&apos;s right (this saves automatically with Save all):
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          placeholder="Club name"
                          value={p.club.name}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, name: e.target.value } })}
                        />
                        <select
                          value={p.club.weekday}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, weekday: e.target.value } })}
                          style={{ flex: "0 0 auto", width: "auto" }}
                        >
                          {WEEKDAYS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          type="time"
                          style={{ flex: "0 0 110px" }}
                          value={p.club.timeFrom}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, timeFrom: e.target.value } })}
                        />
                        <input
                          type="time"
                          style={{ flex: "0 0 110px" }}
                          value={p.club.timeTo}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, timeTo: e.target.value } })}
                        />
                        <input
                          placeholder="Provider (optional)"
                          value={p.club.provider}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, provider: e.target.value } })}
                        />
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          placeholder="Contact phone/email (optional)"
                          value={p.club.contactInfo}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, contactInfo: e.target.value } })}
                        />
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          placeholder="Cost (optional)"
                          value={p.club.cost}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, cost: e.target.value } })}
                        />
                        <input
                          placeholder="Website (optional)"
                          value={p.club.website}
                          onChange={(e) => updatePending(i, { club: { ...p.club!, website: e.target.value } })}
                        />
                      </div>
                      <textarea
                        placeholder="Notes (optional) — what to bring, term dates, etc"
                        value={p.club.notes}
                        onChange={(e) => updatePending(i, { club: { ...p.club!, notes: e.target.value } })}
                        style={{ marginBottom: 6 }}
                      />
                      <button className="chip" onClick={() => saveClub(i, needsClub)}>
                        Save now as {needsClub.join(" & ")}&apos;s club
                      </button>{" "}
                      <button className="chip" onClick={() => updatePending(i, { club: null })}>
                        Don&apos;t save
                      </button>
                    </div>
                  );
                })()}
              {p.food_note &&
                (() => {
                  const needsFood = foodNoteNeeds(p);
                  if (!needsFood.length) return null;
                  return (
                    <div className="note">
                      <div style={{ marginBottom: 6 }}>
                        🍽 New food note for {needsFood.join(" & ")} — check it&apos;s right (this saves automatically with Save
                        all):
                      </div>
                      <div className="row" style={{ margin: "0 0 6px" }}>
                        <input
                          placeholder="Likes (optional)"
                          value={p.food_note.likes}
                          onChange={(e) => updatePending(i, { food_note: { ...p.food_note!, likes: e.target.value } })}
                        />
                        <input
                          placeholder="Dislikes (optional)"
                          value={p.food_note.dislikes}
                          onChange={(e) => updatePending(i, { food_note: { ...p.food_note!, dislikes: e.target.value } })}
                        />
                      </div>
                      <button className="chip" onClick={() => saveFoodNote(i, needsFood)}>
                        Save now to {needsFood.join(" & ")}&apos;s Food box
                      </button>{" "}
                      <button className="chip" onClick={() => updatePending(i, { food_note: null })}>
                        Don&apos;t save
                      </button>
                    </div>
                  );
                })()}
              {p.school_admin_note &&
                (() => {
                  const needsSchoolAdmin = schoolAdminNeeds(p);
                  if (!needsSchoolAdmin.length) return null;
                  return (
                    <div className="note">
                      <div style={{ marginBottom: 6 }}>
                        🏫 New school admin info for {needsSchoolAdmin.join(" & ")} — check it&apos;s right (this saves
                        automatically with Save all):
                      </div>
                      <textarea
                        value={p.school_admin_note}
                        onChange={(e) => updatePending(i, { school_admin_note: e.target.value })}
                        style={{ marginBottom: 6 }}
                      />
                      <button className="chip" onClick={() => saveSchoolAdmin(i, needsSchoolAdmin)}>
                        Save now to {needsSchoolAdmin.join(" & ")}&apos;s School admin notes
                      </button>{" "}
                      <button className="chip" onClick={() => updatePending(i, { school_admin_note: "" })}>
                        Don&apos;t save
                      </button>
                    </div>
                  );
                })()}
              {p.hub_update && (
                <div className="note">
                  <div style={{ marginBottom: 6 }}>
                    🐦 Sounds like hub news — check it&apos;s right (this saves automatically with Save all):
                  </div>
                  <div className="row" style={{ margin: "0 0 6px" }}>
                    <input
                      placeholder="Carer(s) involved"
                      value={p.hub_update.carer_names}
                      onChange={(e) => updatePending(i, { hub_update: { ...p.hub_update!, carer_names: e.target.value } })}
                    />
                    <select
                      value={p.hub_update.support_type}
                      onChange={(e) => updatePending(i, { hub_update: { ...p.hub_update!, support_type: e.target.value } })}
                      style={{ flex: "0 0 auto", width: "auto" }}
                    >
                      {HUB_SUPPORT_TYPES.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="chip" onClick={() => saveHubUpdate(i)}>
                    Save now to Hub log
                  </button>{" "}
                  <button className="chip" onClick={() => updatePending(i, { hub_update: null })}>
                    Don&apos;t save
                  </button>
                </div>
              )}
              {hubLeader?.name &&
                (() => {
                  // A child on Mockingbird "mb5" (this household's own) has
                  // their hub carer fields auto-filled from this same
                  // person -- naming them here means the per-child checkbox
                  // below can skip them instead of offering the same send
                  // twice.
                  const alsoHubFor = p.kids
                    .map((k) => children.find((c) => c.name === k))
                    .filter((c): c is Child => !!c && sameHubCarer(c, hubLeader))
                    .map((c) => c.name);
                  return (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={!!p.send_own_hub}
                        onChange={(e) => updatePending(i, { send_own_hub: e.target.checked })}
                      />
                      📤 Send directly to {hubLeader.name} (your hub carer
                      {alsoHubFor.length ? `, and ${alsoHubFor.join(" & ")}'s` : ""}) — instead of phoning/messaging
                      them separately
                    </label>
                  );
                })()}
              {p.kids
                .map((k) => children.find((c) => c.name === k))
                .filter((c): c is Child => !!c && !!(c.hub_carer_name || c.hub_carer_email))
                .filter((c) => !(hubLeader && sameHubCarer(c, hubLeader)))
                .map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={(p.send_hub ?? []).includes(c.name)}
                      onChange={() => toggleSendHub(i, c.name)}
                    />
                    📤{" "}
                    {c.hub_carer_name
                      ? `Send directly to ${c.hub_carer_name} (${c.name}'s hub carer)`
                      : `Also send this to ${c.name}'s hub carer`}{" "}
                    — instead of phoning/messaging them separately
                  </label>
                ))}
            </div>
          ))}
          <button className="btn" onClick={saveAll}>
            Save all
          </button>
          <button className="btn quiet" onClick={() => setPending([])}>
            Discard
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        <ThingsToDoCard refreshKey={captureVersion} />
        <TodaysEntriesCard />
        <CaptureTrainingCard refreshKey={captureVersion} />
      </div>

      {toast && <div id="toast" className="show">{toast}</div>}
    </div>
  );
}
