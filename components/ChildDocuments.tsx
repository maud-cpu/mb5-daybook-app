"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { childDocumentUrl, deleteChildDocumentFile, uploadChildDocument } from "@/lib/childDocuments";

type Doc = {
  id: string;
  title: string;
  category: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
};

export default function ChildDocuments({ childId }: { childId: string }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    setLoaded(false);
    const { data, error: err } = await supabase
      .from("child_documents")
      .select("*")
      .eq("child_id", childId)
      .order("uploaded_at", { ascending: false });
    if (err) setError(err.message);
    setDocs((data as Doc[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this child's documents on mount / when childId changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  async function handleFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = await uploadChildDocument(supabase, user.id, file);
      const { error: err } = await supabase.from("child_documents").insert({
        child_id: childId,
        title: title.trim() || file.name,
        category: category.trim(),
        file_path: path,
        file_name: file.name,
      });
      if (err) throw err;
      setTitle("");
      setCategory("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that file");
    }
    setUploading(false);
    input.value = "";
  }

  async function open(doc: Doc) {
    setOpeningId(doc.id);
    try {
      const url = await childDocumentUrl(supabase, doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't open that file");
    }
    setOpeningId(null);
  }

  async function remove(doc: Doc) {
    if (!confirm(`Remove "${doc.title || doc.file_name}"? This can't be undone.`)) return;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    await supabase.from("child_documents").delete().eq("id", doc.id);
    await deleteChildDocumentFile(supabase, doc.file_path);
  }

  if (!loaded) return <p className="hint">Loading…</p>;

  return (
    <div style={{ marginTop: 8 }}>
      <p className="hint">
        Old diaries, previous placement notes, meeting minutes, assessments — anything worth keeping for reference,
        for a fuller picture of this child, or to hand on if the placement ends.
      </p>
      {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
      {docs.length === 0 && <p className="empty">Nothing uploaded yet.</p>}
      {docs.map((d) => (
        <div key={d.id} className="rec" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            <b>{d.title || d.file_name}</b>
            <br />
            <small className="muted">
              {[d.category, new Date(d.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          <span style={{ flex: "0 0 auto" }}>
            <button className="chip" disabled={openingId === d.id} onClick={() => open(d)}>
              {openingId === d.id ? "Opening…" : "Open ↗"}
            </button>{" "}
            <button className="chip" onClick={() => remove(d)}>
              Remove
            </button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 10, padding: 8, background: "#fbfaf6", borderRadius: "var(--radius-sm)" }}>
        <input placeholder="Title (optional — defaults to the filename)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          placeholder="Category (e.g. diary, meeting notes, assessment, report)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ marginTop: 6 }}
        />
        <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
          <span className="muted">📎</span>
          <input type="file" style={{ flex: 1, padding: 6, fontSize: 14 }} disabled={uploading} onChange={(e) => handleFile(e.currentTarget)} />
        </div>
        {uploading && <p className="hint">Uploading…</p>}
      </div>
    </div>
  );
}
