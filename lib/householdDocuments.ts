import { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "household-documents";

// Carer-level equivalent of lib/childDocuments.ts -- same reasoning, same
// any-file-type/own-name-can't-collide upload pattern, different bucket.
export async function uploadHouseholdDocument(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function householdDocumentUrl(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return URL.createObjectURL(data);
}

export async function deleteHouseholdDocumentFile(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
