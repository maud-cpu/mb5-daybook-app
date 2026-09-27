import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared with app/api/extract-child-doc/route.ts's own read logic, but kept
// as a separate copy there rather than refactored to use this -- that route
// already works and ships one document at a time with its own fixed
// instruction text, while this one reads many documents at once for /api/ask
// and needs the content back in a form it can combine into a single message.
export type DocContent =
  | { kind: "text"; text: string }
  | { kind: "block"; block: Anthropic.ContentBlockParam }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

function imageMediaType(ext: string, mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}

export async function readChildDocument(supabase: SupabaseClient, path: string): Promise<DocContent> {
  const { data: blob, error } = await supabase.storage.from("child-documents").download(path);
  if (error || !blob) return { kind: "error", message: error?.message || "file not found" };

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  const mimeType = blob.type || "";
  const imgType = imageMediaType(ext, mimeType);

  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    try {
      const { value: text } = await mammoth.extractRawText({ buffer });
      return text.trim() ? { kind: "text", text } : { kind: "error", message: "no text found in that Word document" };
    } catch {
      return { kind: "error", message: "couldn't read that as a Word document" };
    }
  }
  if (ext === "pdf" || mimeType === "application/pdf") {
    return {
      kind: "block",
      block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    };
  }
  if (imgType) {
    return { kind: "block", block: { type: "image", source: { type: "base64", media_type: imgType, data: buffer.toString("base64") } } };
  }
  if (ext === "txt" || mimeType === "text/plain" || (!ext && !mimeType)) {
    const text = buffer.toString("utf-8");
    return text.trim() ? { kind: "text", text } : { kind: "error", message: "empty file" };
  }
  return { kind: "unsupported" };
}
