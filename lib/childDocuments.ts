import { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "child-documents";

// Unlike entry-photos (always resized to one fixed JPEG shape), a document
// can be any file type a carer might have on hand -- a PDF, a scanned
// letter, a Word file -- so this just uploads it as-is under a name that
// can't collide with another file, keeping the original extension so it
// downloads/opens correctly later.
export async function uploadChildDocument(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function childDocumentUrl(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return URL.createObjectURL(data);
}

export async function deleteChildDocumentFile(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
