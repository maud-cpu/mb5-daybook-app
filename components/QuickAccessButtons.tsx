"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractEmail, extractPhone, today } from "@/lib/domain";

type Item = { label: string; name: string; value: string };

export default function QuickAccessButtons() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState<"phone" | "email" | null>(null);
  const [items, setItems] = useState<Item[]>([]);
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
        const p = extractPhone(c.basics?.csw);
        if (p) out.push({ label: `${c.name}'s CSW`, name: "", value: p });
        const pm = extractPhone(c.basics?.cswm);
        if (pm) out.push({ label: `${c.name}'s CSW's manager`, name: "", value: pm });
      });
      (contacts as { label: string; name: string; phone: string }[] | null)
        ?.filter((c) => c.phone)
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.phone }));
    } else {
      if (household?.ssw_email) out.push({ label: "SSW", name: household.ssw_name || "", value: household.ssw_email });
      if (household?.ssw_manager_email) out.push({ label: "SSW's manager", name: household.ssw_manager_name || "", value: household.ssw_manager_email });
      if (household?.hub_leader_email) out.push({ label: "Mockingbird hub leader", name: household.hub_leader_name || "", value: household.hub_leader_email });
      allKids.forEach((c) => {
        const e = extractEmail(c.basics?.csw);
        if (e) out.push({ label: `${c.name}'s CSW`, name: "", value: e });
        const em = extractEmail(c.basics?.cswm);
        if (em) out.push({ label: `${c.name}'s CSW's manager`, name: "", value: em });
      });
      const seen = new Set(out.map((o) => o.value.toLowerCase()));
      (contacts as { label: string; name: string; email: string }[] | null)
        ?.filter((c) => c.email && !seen.has(c.email.toLowerCase()))
        .forEach((c) => out.push({ label: c.label || "Contact", name: c.name || "", value: c.email }));
    }
    setItems(out);
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

  return (
    <div>
      <div id="qaBtns">
        <button onClick={togglePhone} title="Important numbers">
          📞
        </button>
        <button onClick={openEmail} title="Compose an email">
          ✉️
        </button>
      </div>
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
