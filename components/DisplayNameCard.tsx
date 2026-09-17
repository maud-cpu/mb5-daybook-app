"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DisplayNameCard() {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      setName(data?.display_name || "");
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
    setSaved("Saved");
    setTimeout(() => setSaved(""), 1500);
  }

  return (
    <div className="card">
      <h3>Your name</h3>
      <p className="note">
        This is what carers see when they choose to send an entry straight to you, instead of a bare email address.
      </p>
      <input placeholder="e.g. Maud" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
      {saved && <p className="hint">{saved}</p>}
    </div>
  );
}
