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
  /** Ring2 only: this node's id in ring1 -- clusters it next to that node
   * (instead of spreading evenly across the whole outer ring) and draws its
   * connecting line from that node instead of the centre, so it visibly
   * reads as "belongs to this one", not "belongs to everyone". */
  parentId?: string;
};

type Positioned = WheelNode & { x: number; y: number };

function layoutRing(nodes: WheelNode[], radius: number): Positioned[] {
  const count = nodes.length;
  return nodes.map((n, i) => {
    const angle = ((-90 + (360 / Math.max(count, 1)) * i) * Math.PI) / 180;
    return { ...n, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
}

// Ring2 nodes that name a ring1 parentId fan out in a tight arc centred on
// that parent's own angle, rather than being spread evenly across the full
// outer ring -- visually grouping "this adult's children" right next to
// that adult. Anything left over (no parentId, or a parentId that isn't
// actually in ring1) falls back to the old even spread.
function layoutChildRing(nodes: WheelNode[], radius: number, parents: Positioned[]): Positioned[] {
  const parentAngle = new Map(parents.map((p) => [p.id, Math.atan2(p.y - 50, p.x - 50)]));
  const byParent = new Map<string, WheelNode[]>();
  const unparented: WheelNode[] = [];
  nodes.forEach((n) => {
    if (n.parentId && parentAngle.has(n.parentId)) {
      const list = byParent.get(n.parentId) ?? [];
      list.push(n);
      byParent.set(n.parentId, list);
    } else {
      unparented.push(n);
    }
  });

  const clustered: Positioned[] = [];
  const spread = (30 * Math.PI) / 180;
  byParent.forEach((kids, parentId) => {
    const base = parentAngle.get(parentId)!;
    const step = kids.length > 1 ? spread / (kids.length - 1) : 0;
    kids.forEach((n, i) => {
      const angle = kids.length > 1 ? base - spread / 2 + step * i : base;
      clustered.push({ ...n, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) });
    });
  });

  return [...clustered, ...layoutRing(unparented, radius)];
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
  const r2 = layoutChildRing(ring2, 46, r1);
  const all = [...r1, ...r2];
  const r1ById = new Map(r1.map((n) => [n.id, n]));

  return (
    <div style={{ position: "relative", width: `min(92vw, ${maxWidth})`, aspectRatio: "1", margin: "10px auto" }}>
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <circle cx="50" cy="50" r="33" fill="none" stroke="var(--line)" strokeWidth="0.4" />
        {ring2.length > 0 && <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="0.4" />}
        {all.map((n) => {
          const parent = n.parentId ? r1ById.get(n.parentId) : undefined;
          const from = parent ? { x: parent.x, y: parent.y } : { x: 50, y: 50 };
          return (
            <line
              key={n.id}
              x1={from.x}
              y1={from.y}
              x2={n.x}
              y2={n.y}
              stroke={n.dashed ? "var(--line)" : n.color}
              strokeWidth="0.5"
              strokeOpacity={n.dashed ? 0.6 : 0.4}
            />
          );
        })}
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
