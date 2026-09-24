"use client";

import { useEffect, useState } from "react";

export default function DisplayNameCard() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const data = await res.json();
      setName(data.displayName || "");
    }
    load();
  }, []);

  async function save() {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name.trim() }),
    });
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
