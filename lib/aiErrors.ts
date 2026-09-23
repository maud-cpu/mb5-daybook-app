/**
 * Structured outputs only guarantee valid JSON when the model finishes
 * normally. If the response gets cut off by max_tokens mid-string, the
 * SDK's own JSON.parse throws inside messages.parse() itself -- before it
 * can even return a message for the usual `stop_reason === "max_tokens"`
 * check to run on. Any "Failed to parse structured output" error from the
 * SDK is that same truncation, just surfacing one step earlier than expected.
 */
export function aiErrorMessage(e: unknown, tooLongMessage: string): string {
  const message = e instanceof Error ? e.message : "unknown error";
  return /Failed to parse structured output/i.test(message) ? tooLongMessage : message;
}
