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
  if (/Failed to parse structured output/i.test(message)) return tooLongMessage;
  // A raw "401 {...\"authentication_error\"...\"invalid x-api-key\"...}" blob
  // reads like an app bug to someone who isn't expecting it, when it's
  // actually an account-level problem affecting every AI feature at once
  // (sort, ask, summaries, everything shares this one key) -- worth naming
  // plainly rather than surfacing the raw JSON, same reasoning as the
  // credit-balance case in app/api/sort/route.ts.
  if (/authentication_error|invalid x-api-key/i.test(message)) {
    return "The AI service's API key is invalid or has been revoked -- this affects every AI feature, not just this one. Check ANTHROPIC_API_KEY in Vercel's project settings (Settings > Environment Variables) against a current key from console.anthropic.com.";
  }
  return message;
}
