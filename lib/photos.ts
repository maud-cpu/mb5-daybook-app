import { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "entry-photos";

function resizeToJpeg(file: File, maxDim = 1000, quality = 0.72): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h && w > maxDim) {
        h = (h * maxDim) / w;
        w = maxDim;
      } else if (h > maxDim) {
        w = (w * maxDim) / h;
        h = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo"))), "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("Couldn't read that photo"));
    img.src = url;
  });
}

export async function uploadPhoto(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const blob = await resizeToJpeg(file);
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function photoObjectUrl(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return URL.createObjectURL(data);
}

export async function deletePhoto(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
