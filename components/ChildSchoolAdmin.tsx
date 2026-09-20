"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SchoolAdmin = {
  lunch_payment: string;
  homework_app_name: string;
  homework_app_url: string;
  homework_app_login: string;
  class_rep_name: string;
  class_rep_contact: string;
  pta_name: string;
  pta_contact: string;
  pta_facebook: string;
  school_office_contact: string;
  other_links: string;
  notes: string;
};

const BLANK: SchoolAdmin = {
  lunch_payment: "",
  homework_app_name: "",
  homework_app_url: "",
  homework_app_login: "",
  class_rep_name: "",
  class_rep_contact: "",
  pta_name: "",
  pta_contact: "",
  pta_facebook: "",
  school_office_contact: "",
  other_links: "",
  notes: "",
};

const FIELDS: [keyof SchoolAdmin, string, string, "input" | "textarea"][] = [
  ["lunch_payment", "Paying for school lunches", "app/website used, or how it works", "input"],
  ["homework_app_name", "Homework app/website", "e.g. Google Classroom, Tapestry, Seesaw", "input"],
  ["homework_app_url", "Homework app link", "", "input"],
  [
    "homework_app_login",
    "Homework app login",
    "username/password — kept private to your account, same as everything else here",
    "input",
  ],
  ["class_rep_name", "Class rep", "name", "input"],
  ["class_rep_contact", "Class rep contact", "phone/email/WhatsApp — for getting added to the class group", "input"],
  ["pta_name", "PTA / friends of school", "name of the group", "input"],
  ["pta_contact", "PTA contact", "name, phone or email", "input"],
  ["pta_facebook", "PTA Facebook / social group", "link", "input"],
  ["school_office_contact", "School office", "phone/email", "input"],
  ["other_links", "Other useful links", "one per line — payment portals, newsletters, booking systems, uniform shop, etc", "textarea"],
  ["notes", "Anything else", "", "textarea"],
];

export default function ChildSchoolAdmin({ childId }: { childId: string }) {
  const supabase = createClient();
  const [data, setData] = useState<SchoolAdmin>(BLANK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this child's row on mount / when childId changes
    setLoaded(false);
    supabase
      .from("child_school_admin")
      .select("*")
      .eq("child_id", childId)
      .maybeSingle()
      .then(({ data: row }) => {
        setData({ ...BLANK, ...(row as Partial<SchoolAdmin> | null) });
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  function save(key: keyof SchoolAdmin, value: string) {
    const next = { ...data, [key]: value };
    setData(next);
    supabase.from("child_school_admin").upsert({ child_id: childId, ...next }, { onConflict: "child_id" });
  }

  if (!loaded) return <p className="hint">Loading…</p>;

  return (
    <div style={{ marginTop: 8 }}>
      <p className="hint">
        For a new carer picking this up if this child ever moves suddenly — also pulled into the Handover document.
      </p>
      {FIELDS.map(([key, label, hint, kind]) => (
        <div key={key} style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13, display: "block" }}>{label}</b>
          {hint && (
            <p className="hint" style={{ margin: "2px 0 4px" }}>
              {hint}
            </p>
          )}
          {kind === "textarea" ? (
            <textarea defaultValue={data[key]} onBlur={(e) => save(key, e.target.value)} />
          ) : (
            <input defaultValue={data[key]} onBlur={(e) => save(key, e.target.value)} />
          )}
        </div>
      ))}
    </div>
  );
}
