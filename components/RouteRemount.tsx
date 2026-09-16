"use client";

import { usePathname } from "next/navigation";

/**
 * Next's client-side router cache can reuse an already-visited page's
 * component instance instead of remounting it, which skips that page's
 * "load data on mount" effect and shows stale content (e.g. an entry
 * saved on another tab not showing up until a hard refresh). Keying on
 * the path forces a real unmount/remount -- and therefore a fresh fetch
 * -- every time the carer switches tabs.
 */
export default function RouteRemount({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname}>{children}</div>;
}
