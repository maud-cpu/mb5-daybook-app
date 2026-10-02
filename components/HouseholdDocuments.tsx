"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteHouseholdDocumentFile, householdDocumentUrl, uploadHouseholdDocument } from "@/lib/householdDocuments";

export type HouseholdDoc = {
  id: string;
  title: string;
  category: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
};

// Carer-level equivalent of ChildDocuments -- same upload/open/remove
// pattern, no per-field "extract info" (nothing here maps onto a single
// child's basics the way a child document can).
export default function HouseholdDocuments({ onChange }: { onChange?: (docs: HouseholdDoc[]) => void }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<HouseholdDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    setLoaded(false);
    const { documents, error: err } = await fetch("/api/household-documents").then((r) => r.json());
    if (err) setError(err);
    const list = (documents as HouseholdDoc[]) ?? [];
    setDocs(list);
    onChange?.(list);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const path = await uploadHouseholdDocument(supabase, user.id, file);
      const res = await fetch("/api/household-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || file.name,
          category: category.trim(),
          file_path: path,
          file_name: file.name,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't save that document");
      }
      setTitle("");
      setCategory("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that file");
    }
    setUploading(false);
    input.value = "";
  }

  async function open(doc: HouseholdDoc) {
    setOpeningId(doc.id);
    try {
      const url = await householdDocumentUrl(supabase, doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't open that file");
    }
    setOpeningId(null);
  }

  async function remove(doc: HouseholdDoc) {
    if (!confirm(`Remove "${doc.title || doc.file_name}"? This can't be undone.`)) return;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    await fetch(`/api/household-documents?id=${doc.id}`, { method: "DELETE" });
    await deleteHouseholdDocumentFile(supabase, doc.file_path);
  }

  if (!loaded) return <p className="hint">Loading…</p>;

  return (
    <div style={{ marginTop: 8 }}>
      <p className="hint">
        Insurance confirmation, DBS certificate, Safer Care Policy, medical certificate — anything for this year&apos;s
        review, in one place to attach when you send it.
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
          placeholder="Category (e.g. insurance, DBS, policy, medical)"
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
