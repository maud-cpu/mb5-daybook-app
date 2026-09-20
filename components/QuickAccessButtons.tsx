"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractEmail, extractPhone, today } from "@/lib/domain";
import { Reminder, reminderCategoryLabel } from "@/lib/types";

type Item = { label: string; name: string; value: string };

function normalizePhone(v: string): string {
  return v.replace(/[\s\-()]/g, "");
}

// Siblings often share the same CSW (or CSW's manager) -- when two entries
// turn out to be the same phone number, that's one person, not two lines to
// scroll past. Merge them into a single line instead of repeating the number.
function dedupePhoneItems(items: Item[]): Item[] {
  const groups = new Map<string, Item[]>();
  const order: string[] = [];
  items.forEach((it) => {
    const key = normalizePhone(it.value);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(it);
  });
  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    const first = group[0];
    const roleMatch = first.label.match(/^.*?'s (.+)$/);
    const role = roleMatch?.[1];
    if (role && group.every((g) => g.label.endsWith(`'s ${role}`))) {
      const names = group.map((g) => g.label.slice(0, g.label.length - `'s ${role}`.length));
      return { ...first, label: `${names.join(" & ")}'s ${role}` };
    }
    return { ...first, label: group.map((g) => g.label).join(" / ") };
  });
}

export default function QuickAccessButtons() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState<"phone" | "email" | "today" | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [todayItems, setTodayItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(kind: "phone" | "email") {
    setLoading(true);
    const [{ data: rota }, { data: household }, { data: children }, { data: householdChildren }, { data: contacts }] = await Promise.all([
      kind === "phone" ? supabase.from("shared_rota").select("name, phone").eq("date", today()).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from("household")
        .select(
          "ssw_name, ssw_phone, ssw_email, ssw_manager_name, ssw_manager_phone, ssw_manager_email, edt, hub_leader_name, hub_leader_phone, hub_leader_email",
        )
        .maybeSingle(),
      supabase.from("children").select("name, basics"),
      supabase.from("household_children").select("name, basics"),
      supabase.from("contacts").select("label, name, phone, email"),
    ]);

    const allKids = [
      ...((children as { name: string; basics: Record<string, string> }[] | null) ?? []),
      ...((householdChildren as { name: string; basics: Record<string, string> }[] | null) ?? []),
    ];
    const out: Item[] = [];
    if (kind === "phone") {
      if (rota?.phone) out.push({ label: "Out of hours tonight", name: rota.name || "", value: rota.phone });
      if (household?.ssw_phone) out.push({ label: "SSW", name: household.ssw_name || "", value: household.ssw_phone });
      if (household?.ssw_manager_phone) out.push({ label: "SSW's manager", name: household.ssw_manager_name || "", value: household.ssw_manager_phone });
      if (household?.hub_leader_phone) out.push({ label: "Mockingbird hub leader", name: household.hub_leader_name || "", value: household.hub_leader_phone });
      const edtPhone = extractPhone(household?.edt);
      if (edtPhone) out.push({ label: "Emergency Duty Team", name: "", value: edtPhone });
      allKids.forEach((c) => {
        const p = c.basics?.csw_phone || extractPhone(c.basics?.csw);
        if (p) out.push({ label: `${c.name}'s CSW`, name: c.basics?.csw || "", value: p });
        const pm = c.basics?.cswm_phone || extractPhone(c.basics?.cswm);
        if (pm) out.push({ label: `${c.name}'s CSW's manager`, name: c.basics?.cswm || "", value: pm });
        const pi = c.basics?.iro_phone;
        if (pi) out.push({ label: `${c.name}'s IRO`, name: c.basics?.iro || "", value: pi });
      });
      (contacts as { label: string; name: string; phone: string }[] | null)
        ?.filter((c) => c.phone)
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.phone }));
    } else {
      if (household?.ssw_email) out.push({ label: "SSW", name: household.ssw_name || "", value: household.ssw_email });
      if (household?.ssw_manager_email) out.push({ label: "SSW's manager", name: household.ssw_manager_name || "", value: household.ssw_manager_email });
      if (household?.hub_leader_email) out.push({ label: "Mockingbird hub leader", name: household.hub_leader_name || "", value: household.hub_leader_email });
      allKids.forEach((c) => {
        const e = c.basics?.csw_email || extractEmail(c.basics?.csw);
        if (e) out.push({ label: `${c.name}'s CSW`, name: c.basics?.csw || "", value: e });
        const em = c.basics?.cswm_email || extractEmail(c.basics?.cswm);
        if (em) out.push({ label: `${c.name}'s CSW's manager`, name: c.basics?.cswm || "", value: em });
        const ei = c.basics?.iro_email;
        if (ei) out.push({ label: `${c.name}'s IRO`, name: c.basics?.iro || "", value: ei });
      });
      const seen = new Set(out.map((o) => o.value.toLowerCase()));
      (contacts as { label: string; name: string; email: string }[] | null)
        ?.filter((c) => c.email && !seen.has(c.email.toLowerCase()))
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.email }));
    }
    setItems(kind === "phone" ? dedupePhoneItems(out) : out);
    setLoading(false);
  }

  function togglePhone() {
    if (open === "phone") {
      setOpen(null);
      return;
    }
    setOpen("phone");
    load("phone");
  }

  function openEmail() {
    setOpen(null);
    router.push("/dashboard/entries?compose=1");
  }

  async function toggleToday() {
    if (open === "today") {
      setOpen(null);
      return;
    }
    setOpen("today");
    setLoading(true);
    const { data } = await supabase.from("reminders").select("*").eq("done", false).eq("date", today());
    setTodayItems((data as Reminder[]) ?? []);
    setLoading(false);
  }

  return (
    <div>
      <div id="qaBtns">
        <button onClick={togglePhone} title="Important numbers">
          📞
        </button>
        <button onClick={openEmail} title="Compose an email">
          ✉️
        </button>
        <button onClick={toggleToday} title="What's happening today">
          📅
        </button>
      </div>
      {open === "today" && (
        <div id="qaPanel" className="show">
          {loading && <p className="hint">Loading…</p>}
          {!loading && todayItems.length === 0 && <p className="empty">Nothing on the calendar today.</p>}
          {!loading &&
            todayItems.map((r) => (
              <div className="qi" key={r.id}>
                <b>{reminderCategoryLabel(r.category)}</b> {r.text}
                {r.child ? ` · ${r.child}` : ""}
                {r.amount != null ? ` · £${Number(r.amount).toFixed(2)}` : ""}
              </div>
            ))}
        </div>
      )}
      {open === "phone" && (
        <div id="qaPanel" className="show">
          {loading && <p className="hint">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="empty">Nothing set yet — add SSW / CSW details in About us.</p>
          )}
          {!loading &&
            items.map((it, i) => (
              <div className="qi" key={i}>
                <b>{it.label}</b>
                {it.name ? " — " + it.name : ""}
                <br />
                <a href={`tel:${it.value}`}>{it.value}</a>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
