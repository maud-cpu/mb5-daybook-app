"use client";

// A proper in-app dialog for the one class of confirmation that actually
// needs to be clear rather than just "are you sure" -- deleting something
// that cascades to a linked item elsewhere (a reminder's calendar entry
// also removing its Entries/Expenses record, or vice versa). The browser's
// own confirm() can't be styled or made to show structured detail like
// "this will also remove it from: Calendar" -- it's one plain line with an
// OK/Cancel the carer has no way to read calmly before tapping through.
export default function ConfirmDialog({
  title,
  itemLabel,
  alsoRemoves,
  confirmLabel = "Remove",
  onConfirm,
  onCancel,
}: {
  title: string;
  /** The entry's own text, shown as a quoted line so it's clear which one this is about. */
  itemLabel?: string;
  /** Other places this will also disappear from (e.g. ["Calendar"], ["Entries / Expenses"]) -- omitted or empty shows no such warning. */
  alsoRemoves?: string[];
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {itemLabel && (
          <p className="muted" style={{ fontStyle: "italic" }}>
            &quot;{itemLabel}&quot;
          </p>
        )}
        {alsoRemoves && alsoRemoves.length > 0 && (
          <div className="note" style={{ marginTop: 10, background: "var(--danger-soft)" }}>
            <b>This will also remove it from:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {alsoRemoves.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button className="chip" style={{ flex: "0 0 auto" }} onClick={onCancel}>
            Cancel
          </button>
          <button className="chip" style={{ flex: "0 0 auto", background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
