"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Now that co-carers share the same Entries log, telling your own
// observations apart from a co-carer's amendments needs their name, not
// just their user_id. Returns null for your own entries deliberately --
// labelling every one of your own entries "by you" would just be noise.
export function useHouseholdNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      const { data } = await supabase.from("profiles").select("id, display_name");
      const map: Record<string, string> = {};
      (data as { id: string; display_name: string }[] | null)?.forEach((p) => {
        map[p.id] = p.display_name || "";
      });
      setNames(map);
    }
    load();
  }, []);

  function authorOf(userId: string | null | undefined): string | null {
    if (!userId || userId === myId) return null;
    return names[userId] || null;
  }

  return { authorOf, myId };
}
