"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { today } from "@/lib/domain";

type NewsItem = {
  id: string;
  title: string;
  body: string;
  category: "training" | "announcement" | "general";
  expires_on: string | null;
  linked_course_id: string | null;
};

const CATEGORY_ICON: Record<NewsItem["category"], string> = {
  training: "🎓",
  announcement: "📣",
  general: "📌",
};

// A notice from Surrey/the agency (a training opportunity, a policy
// change, a deadline) used to only ever reach one carer, by whoever
// happened to get the email or WhatsApp message -- this is that same
// notice, pasted in once via admin, showing here for everyone until it's
// no longer relevant or a carer's dismissed it for themselves.
export default function NewsCard() {
  const supabase = createClient();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const t = today();
    const [{ data: news }, { data: dis }] = await Promise.all([
      supabase
        .from("shared_news")
        .select("id, title, body, category, expires_on, linked_course_id")
        .order("created_at", { ascending: false }),
      supabase.from("dismissed_news").select("news_id"),
    ]);
    const active = ((news as NewsItem[] | null) ?? []).filter((n) => !n.expires_on || n.expires_on >= t);
    setItems(active);
    setDismissed(new Set(((dis as { news_id: string }[] | null) ?? []).map((d) => d.news_id)));
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("dismissed_news").upsert({ user_id: user.id, news_id: id });
  }

  const visible = items.filter((n) => !dismissed.has(n.id));

  if (!loaded || visible.length === 0) return null;

  return (
    <div className="card">
      <h3>News &amp; Events</h3>
      {visible.map((n) => (
        <div key={n.id} className="rec" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ flex: 1 }}>
            <b>
              {CATEGORY_ICON[n.category]} {n.title}
            </b>
            <br />
            <small className="muted">{n.body}</small>
            {n.category === "training" && n.linked_course_id && (
              <>
                {" "}
                <Link href={`/dashboard/training?q=${encodeURIComponent(n.title)}`} className="hint">
                  See in Training & Resources ↗
                </Link>
              </>
            )}
          </span>
          <button className="chip" style={{ flex: "0 0 auto" }} onClick={() => dismiss(n.id)}>
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}
