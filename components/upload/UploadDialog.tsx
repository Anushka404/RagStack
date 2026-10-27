"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { driveProcessing } from "@/lib/client/processing";
import { formatBytes, plural } from "@/lib/client/format";
import { DocumentRow, DOCUMENTS_BUCKET, FILE_TYPES, fileExtension, MAX_FILE_BYTES } from "@/types/documents";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Existing collection names, offered as suggestions. */
  collections: string[];
  /** Links the upload to this chat thread (sidebar label). */
  threadId?: string;
  /** Every new state of the uploaded document, so the parent's list stays current. */
  onDocument: (doc: DocumentRow) => void;
}

const STEPS = ["Upload to storage", "Extract text", "Clean text", "Chunk", "Attach metadata", "Embed and index", "Ready"];
/** Minimum time each step stays highlighted, so the pipeline can be narrated. */
const STEP_DWELL_MS = 700;

/** Index of the first step that isn't finished yet, from what the server has reported. */
function reachedStep(doc: DocumentRow | null, uploaded: boolean) {
  if (!uploaded || !doc) return 0;
  if (doc.status === "ready") return STEPS.length;
  if (doc.status === "embedding") return 5; // parsing, cleaning, chunking and metadata are done
  return 1;
}

function stepDetail(i: number, doc: DocumentRow | null, file: File | null, done: boolean): string {
  const s = doc?.stats ?? {};
  switch (i) {
    case 0: return file ? `${file.name} · ${formatBytes(file.size)} · private bucket` : "";
    case 1:
      if (done) return `${plural(s.pages ?? 0, "page")} read${s.ocr ? ` · ${s.ocr.pages} scanned by OCR (${s.ocr.model})` : ""}`;
      return s.ocr
        ? `Scanned pages: OCR ${s.ocr.done}/${s.ocr.pages} with ${s.ocr.model}…`
        : "Reading the file…";
    case 2: return !done ? "Removing repeated headers and footers…"
      : s.removedLines ? `${s.removedLines} repeated header/footer lines removed · whitespace normalized`
      : "No repeated headers or footers · whitespace normalized";
    case 3: return `${plural(doc?.chunk_count ?? 0, "chunk")} · ${s.chunkSize ?? 1000} chars, ${s.chunkOverlap ?? 150} overlap`;
    case 4: return doc ? [doc.collection, doc.year, "page numbers", ...(doc.tags ?? [])].filter(Boolean).join(" · ") : "";
    case 5: return done
      ? `${plural(doc?.chunk_count ?? 0, "vector")} in Pinecone · keyword index updated`
      : `Embedding ${doc?.processed_chunks ?? 0}/${doc?.chunk_count ?? 0} with ${s.embeddingModel ?? "the embedding model"}…`;
    default: return "Searchable in chat and the knowledge base";
  }
}

export function UploadDialog({ open, onClose, collections, threadId, onDocument }: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [collection, setCollection] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [formError, setFormError] = useState("");
  const [running, setRunning] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Advance the highlighted step one at a time toward what the server reached.
  const reached = reachedStep(doc, uploaded);
  useEffect(() => {
    if (!running || shown >= reached) return;
    const t = setTimeout(() => setShown((s) => s + 1), STEP_DWELL_MS);
    return () => clearTimeout(t);
  }, [running, shown, reached]);

  const reset = () => {
    setFile(null); setYear(""); setTags(""); setFormError("");
    setRunning(false); setUploaded(false); setDoc(null); setError(""); setShown(0);
  };

  const finished = shown >= STEPS.length;

  const close = () => {
    // Processing carries on in the background; the parent keeps receiving updates.
    onClose();
    if (!running || finished || error) reset();
  };

  // Reopening after a background upload finished starts a fresh form.
  useEffect(() => {
    if (open && (finished || error)) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (d: DocumentRow) => {
    setDoc(d);
    onDocument(d);
    if (d.status === "failed") setError(d.error || "Processing failed");
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setFormError("Choose a file first.");
    const ext = fileExtension(file.name);
    if (!ext) return setFormError("Supported formats: PDF, DOCX, TXT, Markdown and CSV.");
    if (file.size > MAX_FILE_BYTES) return setFormError("Files must be under 50 MB.");
    if (year && !(Number(year) >= 1900 && Number(year) <= 2100)) return setFormError("Year must be between 1900 and 2100.");

    setFormError(""); setError(""); setRunning(true); setShown(0);
    let docId: string | null = null;
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSizeBytes: file.size,
          threadId,
          collection: collection.trim() || "General",
          year: year ? Number(year) : null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.document) throw new Error(data.error || "Upload failed");
      const registered = data.document as DocumentRow;
      docId = registered.id;

      // Straight to Storage, which avoids the serverless request body limit.
      const { error: uploadError } = await createClient()
        .storage.from(DOCUMENTS_BUCKET)
        // The browser's MIME guess varies (Windows reports CSV as Excel), so use our own.
        .upload(registered.storage_path!, file, { contentType: FILE_TYPES[ext] });
      if (uploadError) throw new Error(uploadError.message);

      setUploaded(true);
      update(registered);
      await driveProcessing(registered, update);
    } catch (err) {
      // Don't leave an orphaned row behind when the file never reached Storage.
      if (docId) fetch(`/api/documents/${docId}`, { method: "DELETE" }).catch(() => {});
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => { e.preventDefault(); close(); }}
      className="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/[0.07] bg-[#16161e] p-0 text-[#e8e8f0] backdrop:bg-black/60"
    >
      <div className="p-6">
        <div className="flex items-center mb-4">
          <h2 className="text-base font-semibold">Upload to knowledge base</h2>
          <button onClick={close} aria-label="Close" className="ml-auto p-1 rounded-md text-[#8888aa] hover:text-[#e8e8f0] hover:bg-white/[0.06]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {!running ? (
          <form onSubmit={start} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
              File (PDF, DOCX, TXT, Markdown or CSV)
              <input
                type="file" accept={Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",")}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFormError(""); }}
                className="text-sm text-[#e8e8f0] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#4f6eff]/15 file:text-[#8ba0ff] file:text-xs file:font-medium"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
                Collection
                <input
                  list="collection-options" value={collection} placeholder="General"
                  onChange={(e) => setCollection(e.target.value)} maxLength={60}
                  className="px-3 py-2 bg-[#1e1e2a] border border-white/[0.07] rounded-lg text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none focus:border-[#4f6eff]"
                />
                <datalist id="collection-options">
                  {collections.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
                Year (optional)
                <input
                  type="number" min={1900} max={2100} value={year} placeholder="2026"
                  onChange={(e) => { setYear(e.target.value); setFormError(""); }}
                  className="px-3 py-2 bg-[#1e1e2a] border border-white/[0.07] rounded-lg text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none focus:border-[#4f6eff]"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#8888aa]">
              Tags (optional, comma separated)
              <input
                value={tags} placeholder="pacific, sensors"
                onChange={(e) => setTags(e.target.value)}
                className="px-3 py-2 bg-[#1e1e2a] border border-white/[0.07] rounded-lg text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none focus:border-[#4f6eff]"
              />
            </label>
            {formError && <p className="text-[13px] text-red-400">{formError}</p>}
            <button type="submit" className="mt-1 py-2.5 bg-[#4f6eff] hover:bg-[#6381ff] text-white text-sm font-semibold rounded-xl transition">
              Upload and index
            </button>
          </form>
        ) : (
          <div>
            <ol className="flex flex-col gap-0.5" aria-live="polite">
              {STEPS.map((label, i) => {
                const done = i < shown;
                const active = i === shown && !finished;
                const failed = active && !!error;
                return (
                  <li key={label} className={`flex gap-3 items-start py-1.5 transition-opacity ${done || active ? "opacity-100" : "opacity-35"}`}>
                    <span className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                      failed ? "bg-red-500/20 text-red-400" : done ? "bg-emerald-500/20 text-emerald-400" : active ? "bg-[#4f6eff]/25 text-[#8ba0ff]" : "bg-white/[0.06] text-[#555570]"
                    }`}>
                      {failed ? "!" : done ? "✓" : active ? <span className="spinner !w-3 !h-3 !border-[1.5px]" /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm ${failed ? "text-red-400" : "text-[#e8e8f0]"}`}>{label}</p>
                      {(done || active) && (
                        <p className={`text-xs mt-0.5 ${failed ? "text-red-400" : "text-[#8888aa]"} break-words`}>
                          {failed ? error : stepDetail(i, doc, file, done)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <button onClick={close} className="mt-4 w-full py-2.5 border border-white/[0.1] hover:bg-white/[0.05] text-sm font-medium rounded-xl transition">
              {finished || error ? "Close" : "Close (keeps processing in the background)"}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
