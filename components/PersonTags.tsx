import { personColor } from "@/lib/calendarHelpers";

export function PersonDot({ name }: { name: string }) {
  return (
    <span
      style={{ width: 8, height: 8, borderRadius: "50%", background: personColor(name), display: "inline-block" }}
    />
  );
}

export default function PersonTags({ people }: { people: string[] }) {
  if (!people.length) return null;
  return (
    <span style={{ marginLeft: 4 }}>
      {people.map((p, i) => (
        <span key={p + i} style={{ display: "inline-flex", alignItems: "center", gap: 3, marginRight: 6 }}>
          <PersonDot name={p} />
          {p}
        </span>
      ))}
    </span>
  );
}
