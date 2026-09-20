"use client";

import { useState } from "react";
import { PersonDot } from "@/components/PersonTags";

export type PersonOption = { name: string; kind: "child" | "adult" };

/**
 * Multi-select for "who's this calendar entry for" -- household children and
 * adults as toggle chips, plus a free-text box for anyone else entirely
 * (a friend joining a trip, a cousin, anyone with no row in this app at all).
 */
export default function PeoplePicker({
  options,
  selected,
  onChange,
}: {
  options: PersonOption[];
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const [extraName, setExtraName] = useState("");

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  }

  function addExtra() {
    const name = extraName.trim();
    if (!name || selected.includes(name)) return;
    onChange([...selected, name]);
    setExtraName("");
  }

  const extras = selected.filter((n) => !options.some((o) => o.name === n));

  return (
    <div style={{ marginTop: 6 }}>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            className={`chip${selected.includes(o.name) ? " on" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => toggle(o.name)}
          >
            <PersonDot name={o.name} />
            {o.kind === "adult" ? "🧑 " : ""}
            {o.name}
          </button>
        ))}
        {extras.map((n) => (
          <button
            key={n}
            type="button"
            className="chip on"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => toggle(n)}
          >
            <PersonDot name={n} />
            {n} ×
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input
          placeholder="Someone else (name)"
          value={extraName}
          onChange={(e) => setExtraName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addExtra();
            }
          }}
        />
        <button type="button" className="chip" style={{ flex: "0 0 auto" }} onClick={addExtra}>
          + add
        </button>
      </div>
    </div>
  );
}
