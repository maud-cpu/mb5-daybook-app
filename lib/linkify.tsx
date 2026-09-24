import { ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s]+)/g;

// Free text pasted from an email/WhatsApp message often carries its own
// booking/info link inline in the body -- shown as plain text, it isn't
// tappable. Splits on URLs and renders each as a real link, leaving
// everything else as plain text either side of it.
export function linkify(text: string): ReactNode[] {
  // String.split with a capturing group interleaves the matches back into
  // the result at odd indices -- checked by position, not by re-testing the
  // (global, stateful) regex against each piece.
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
