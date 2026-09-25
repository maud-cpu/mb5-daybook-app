"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { childDocumentUrl, deleteChildDocumentFile, uploadChildDocument } from "@/lib/childDocuments";
import { BASICS_SECTIONS } from "@/lib/basics";

type Doc = {
  id: string;
  title: string;
  category: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
};

type Conflict = { key: string; current: string; extracted: string };

function fieldLabel(key: string): string {
  for (const section of BASICS_SECTIONS) {
    const field = section.fields.find((f) => f.key === key);
    if (field) return field.label;
  }
  return key;
}

export default function ChildDocuments({
  childId,
  basics,
  onApplyExtracted,
}: {
  childId: string;
  /** Current basics values, so extraction only offers to fill empty boxes and flags the rest as conflicts. */
  basics?: Record<string, string>;
  /** Applies one or more extracted fields straight to this child's basics -- caller owns which table (children vs household_children). */
  onApplyExtracted?: (patch: Record<string, string>) => void;
}) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractError, setExtractError] = useState("");
  const [filledCount, setFilledCount] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

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

  async function extractInfo(doc: Doc) {
    if (!onApplyExtracted) return;
    setExtractingId(doc.id);
    setExtractError("");
    setConflicts([]);
    setFilledCount(0);
    try {
      const res = await fetch("/api/extract-child-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: doc.file_path }),
      });
      const data = await res.json();
      if (data.error) {
        setExtractError(data.error);
        setExtractingId(null);
        return;
      }
      const profile = data.profile as Record<string, string>;
      const current = basics || {};
      const toFill: Record<string, string> = {};
      const conflictList: Conflict[] = [];
      Object.entries(profile).forEach(([key, value]) => {
        const v = (value || "").trim();
        if (!v) return;
        const existing = (current[key] || "").trim();
        if (!existing) toFill[key] = v;
        else if (existing !== v) conflictList.push({ key, current: existing, extracted: v });
      });
      if (Object.keys(toFill).length) {
        onApplyExtracted(toFill);
        setFilledCount(Object.keys(toFill).length);
      }
      setConflicts(conflictList);
      if (!Object.keys(toFill).length && !conflictList.length) {
        setExtractError("Couldn't find anything new in that document.");
      }
    } catch {
      setExtractError("Couldn't reach the reading service — try again in a moment.");
    }
    setExtractingId(null);
  }

  function resolveConflict(key: string, replace: boolean) {
    const conflict = conflicts.find((c) => c.key === key);
    if (replace && conflict && onApplyExtracted) onApplyExtracted({ [key]: conflict.extracted });
    setConflicts((prev) => prev.filter((c) => c.key !== key));
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
            {onApplyExtracted && (
              <button className="chip" disabled={extractingId === d.id} onClick={() => extractInfo(d)}>
                {extractingId === d.id ? "Reading…" : "🪄 Extract info"}
              </button>
            )}{" "}
            <button className="chip" onClick={() => remove(d)}>
              Remove
            </button>
          </span>
        </div>
      ))}
      {extractError && <p style={{ color: "var(--danger)", fontSize: 14 }}>{extractError}</p>}
      {filledCount > 0 && (
        <p className="hint">
          Filled in {filledCount} empty box{filledCount === 1 ? "" : "es"} from that document.
        </p>
      )}
      {conflicts.length > 0 && (
        <div className="note" style={{ marginTop: 8 }}>
          <b>Already filled in — replace with what the document says?</b>
          {conflicts.map((c) => (
            <div key={c.key} style={{ marginTop: 8 }}>
              <b>{fieldLabel(c.key)}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                Currently: {c.current}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Document says: {c.extracted}
              </div>
              <button className="chip" onClick={() => resolveConflict(c.key, true)}>
                Replace
              </button>{" "}
              <button className="chip" onClick={() => resolveConflict(c.key, false)}>
                Keep mine
              </button>
            </div>
          ))}
        </div>
      )}
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
