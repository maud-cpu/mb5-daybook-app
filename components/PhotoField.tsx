"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deletePhoto, photoObjectUrl, uploadPhoto } from "@/lib/photos";

export default function PhotoField({ photos, onChange }: { photos: string[]; onChange: (next: string[]) => void }) {
  const supabase = createClient();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    photos.forEach((p) => {
      if (urls[p]) return;
      photoObjectUrl(supabase, p).then((url) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, [p]: url }));
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.join(",")]);

  async function handleFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const path = await uploadPhoto(supabase, user.id, file);
      onChange([...photos, path]);
    } catch {
      // silently ignore -- the entry can be saved without the photo
    }
    setBusy(false);
    input.value = "";
  }

  async function remove(path: string) {
    onChange(photos.filter((p) => p !== path));
    await deletePhoto(supabase, path);
  }

  return (
    <div>
      {photos.length > 0 && (
        <div className="photos">
          {photos.map((p) => (
            <span className="ph" key={p}>
              {urls[p] && <img src={urls[p]} onClick={() => setLightbox(urls[p])} alt="" />}
              <button onClick={() => remove(p)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="row" style={{ alignItems: "center" }}>
        <span className="muted">📷</span>
        <input
          type="file"
          accept="image/*"
          style={{ flex: 1, padding: 6, fontSize: 14 }}
          disabled={busy}
          onChange={(e) => handleFile(e.currentTarget)}
        />
      </div>
      {lightbox && (
        <div
          id="lightbox"
          style={{ display: "flex" }}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}
