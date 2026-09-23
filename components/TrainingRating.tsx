"use client";

import { useState } from "react";

export type Feedback = { course_id: string; user_id: string; rating: number; comment: string };

function StarPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          title={`${n} star${n > 1 ? "s" : ""}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            padding: "0 1px",
            color: n <= value ? "var(--marker)" : "#ccc",
          }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// Shared between Training & Resources (every course) and Capture's own
// training-suggestion card (just the ones a note actually triggered) --
// both rate the same shared_training_catalog rows into the same
// training_feedback table, so this is the one place that logic lives.
export default function RatingWidget({
  course,
  feedback,
  myUserId,
  onRate,
  compact = false,
}: {
  course: { id: string; external_rating: number | null; external_rating_note: string };
  feedback: Feedback[];
  myUserId: string;
  onRate: (courseId: string, rating: number, comment: string) => void;
  /** Renders just a small trigger chip (meant to sit inline in a row of
   * other buttons) plus the expanded panel as a sibling, instead of its
   * own labelled block -- used where space is tight, e.g. Capture's
   * training-suggestion card. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mine = feedback.find((f) => f.course_id === course.id && f.user_id === myUserId);
  const [comment, setComment] = useState(mine?.comment || "");
  const householdRatings = feedback.filter((f) => f.course_id === course.id);
  const householdAvg = householdRatings.length
    ? householdRatings.reduce((s, f) => s + f.rating, 0) / householdRatings.length
    : null;

  const summary = [
    course.external_rating
      ? `⭐ ${course.external_rating.toFixed(1)}${course.external_rating_note ? ` (${course.external_rating_note})` : ""}`
      : "",
    householdAvg !== null
      ? `👪 ${householdAvg.toFixed(1)} from ${householdRatings.length} carer${householdRatings.length > 1 ? "s" : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const panel = open && (
    <div style={{ marginTop: 6, width: "100%" }}>
      <StarPicker value={mine?.rating || 0} onPick={(n) => onRate(course.id, n, comment)} />
      <input
        placeholder="Optional comment for other carers"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => mine && onRate(course.id, mine.rating, comment)}
        style={{ marginTop: 4 }}
      />
      {householdRatings
        .filter((f) => f.comment.trim())
        .map((f, i) => (
          <p key={i} className="note" style={{ marginTop: 4 }}>
            {"★".repeat(f.rating)} {f.comment}
          </p>
        ))}
    </div>
  );

  if (compact) {
    return (
      <>
        {summary && (
          <small className="muted" style={{ display: "block", width: "100%" }}>
            {summary}
          </small>
        )}
        <button className="chip" style={{ fontSize: 13, padding: "5px 10px" }} onClick={() => setOpen(!open)}>
          {mine ? "⭐ Update" : "⭐ Rate"}
        </button>
        {panel}
      </>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      {summary && (
        <small className="muted" style={{ display: "block" }}>
          {summary}
        </small>
      )}
      <button className="chip" onClick={() => setOpen(!open)}>
        {mine ? "Update your rating" : "Rate this"}
      </button>
      {panel}
    </div>
  );
}
