"use client";

// A hub-and-spoke picture of the household: the main carer(s) sit in the
// centre, children who live here form the inner ring, and everyone else
// (visiting children, visitors, the SSW) forms the outer ring. Tapping any
// circle is the only way in or out of that person's details -- there's
// nothing to scroll past to find them.
export type WheelNode = {
  id: string;
  label: string;
  color: string;
  /** A "+ add" node rather than a real person. */
  dashed?: boolean;
};

type Positioned = WheelNode & { x: number; y: number };

function layoutRing(nodes: WheelNode[], radius: number): Positioned[] {
  const count = nodes.length;
  return nodes.map((n, i) => {
    const angle = ((-90 + (360 / Math.max(count, 1)) * i) * Math.PI) / 180;
    return { ...n, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
}

function NodeButton({
  n,
  sizePct,
  isCenter,
  selected,
  onSelect,
}: {
  n: Positioned | WheelNode;
  sizePct: number;
  isCenter?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const pos = "x" in n ? { left: `${n.x}%`, top: `${n.y}%` } : { left: "50%", top: "50%" };
  return (
    <button
      onClick={() => onSelect(n.id)}
      title={n.label}
      style={{
        position: "absolute",
        ...pos,
        transform: "translate(-50%, -50%)",
        width: `${sizePct}%`,
        aspectRatio: "1",
        borderRadius: "50%",
        border: n.dashed
          ? "2px dashed var(--line)"
          : selected
            ? "3px solid var(--ink)"
            : isCenter
              ? "3px solid #fff"
              : "2.5px solid #fff",
        background: n.dashed ? "#fff" : n.color,
        color: n.dashed ? "var(--grey)" : "#fff",
        fontWeight: isCenter ? 800 : 700,
        fontSize: isCenter ? "clamp(11px, 3vw, 15px)" : "clamp(9.5px, 2.4vw, 12.5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 3,
        lineHeight: 1.1,
        boxShadow: n.dashed ? "none" : isCenter ? "var(--shadow-md)" : "var(--shadow-sm)",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {n.label}
    </button>
  );
}

export default function RadialWheel({
  center,
  ring1,
  ring2 = [],
  selectedId,
  onSelect,
  maxWidth = "520px",
}: {
  center: WheelNode;
  ring1: WheelNode[];
  ring2?: WheelNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Caps how wide this wheel grows -- lets two wheels sit side by side. */
  maxWidth?: string;
}) {
  const r1 = layoutRing(ring1, 33);
  const r2 = layoutRing(ring2, 46);
  const all = [...r1, ...r2];

  return (
    <div style={{ position: "relative", width: `min(92vw, ${maxWidth})`, aspectRatio: "1", margin: "10px auto" }}>
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <circle cx="50" cy="50" r="33" fill="none" stroke="var(--line)" strokeWidth="0.4" />
        {ring2.length > 0 && <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="0.4" />}
        {all.map((n) => (
          <line
            key={n.id}
            x1="50"
            y1="50"
            x2={n.x}
            y2={n.y}
            stroke={n.dashed ? "var(--line)" : n.color}
            strokeWidth="0.5"
            strokeOpacity={n.dashed ? 0.6 : 0.4}
          />
        ))}
      </svg>

      <NodeButton n={center} sizePct={27} isCenter selected={selectedId === center.id} onSelect={onSelect} />
      {r1.map((n) => (
        <NodeButton key={n.id} n={n} sizePct={17} selected={selectedId === n.id} onSelect={onSelect} />
      ))}
      {r2.map((n) => (
        <NodeButton key={n.id} n={n} sizePct={14} selected={selectedId === n.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
