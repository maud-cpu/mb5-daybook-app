// Maud's UK Amazon Associates tag -- applied to every Amazon link a carer
// can click, whether it was typed in by hand, pulled in via bulk-add, or
// rebuilt automatically for a book with no link. Centralised here so it
// only needs to change in one place if the tag itself ever changes.
export const AMAZON_ASSOCIATES_TAG = "fostercarersu-21";

export function withAmazonAffiliateTag(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!/(^|\.)amazon\.[a-z.]+$/i.test(u.hostname)) return url;
    // The tag is only registered for the UK marketplace -- a link copied
    // from amazon.com (or any other Amazon domain) is rewritten to
    // amazon.co.uk so the tag is actually valid rather than silently doing
    // nothing on a marketplace it isn't registered for.
    u.hostname = "www.amazon.co.uk";
    u.searchParams.set("tag", AMAZON_ASSOCIATES_TAG);
    return u.toString();
  } catch {
    return url;
  }
}
