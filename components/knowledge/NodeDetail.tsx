"use client";

import Link from "next/link";
import { ChunkRow, DocumentRow } from "@/types/documents";
import { formatBytes } from "@/lib/client/format";

export type Selection =
  | { kind: "collection"; collection: string }
  | { kind: "year"; collection: string; year: number | null }
  | { kind: "document"; docId: string }
  | { kind: "page"; docId: string; page: number | null }
  | { kind: "chunk"; docId: string; chunkId: string };

interface NodeDetailProps {
  selection: Selection | null;
  documents: DocumentRow[];
  chunksByDoc: Record<string, ChunkRow[] | undefined>;
  deletingId: string | null;
  onDelete: (doc: DocumentRow) => void;
  onRetry: (doc: DocumentRow) => void;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-white/[0.05] text-[13px]">
      <span className="text-[#8888aa] flex-shrink-0">{label}</span>
      <span className={`text-right text-[#e8e8f0] break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

/** Opens the chat with retrieval restricted to this part of the knowledge base. */
function AskLink({ params }: { params: Record<string, string | number | null | undefined> }) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)])
  );
  return (
    <Link href={`/?${qs}`} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4f6eff] hover:bg-[#6381ff] text-white transition">
      Ask about this in chat
    </Link>
  );
}

const sum = (docs: DocumentRow[]) => docs.reduce((n, d) => n + d.chunk_count, 0);

export function NodeDetail({ selection, documents, chunksByDoc, deletingId, onDelete, onRetry }: NodeDetailProps) {
  if (!selection) {
    return <p className="text-sm text-[#8888aa]">Select a collection, year, document, page or chunk to see its metadata.</p>;
  }

  if (selection.kind === "collection" || selection.kind === "year") {
    const docs = documents.filter(
      (d) => d.collection === selection.collection && (selection.kind === "collection" || d.year === selection.year)
    );
    const years = [...new Set(docs.map((d) => d.year).filter(Boolean))].sort();
    const tags = [...new Set(docs.flatMap((d) => d.tags))];
    const year = selection.kind === "year" ? selection.year : null;
    return (
      <div>
        <p className="text-xs text-[#555570] mb-1">{selection.kind === "collection" ? "Collection" : "Year group"}</p>
        <h3 className="text-base font-semibold mb-3">
          {selection.kind === "collection" ? selection.collection : `${selection.collection} · ${year ?? "No year"}`}
        </h3>
        <Row label="Documents" value={docs.length} />
        <Row label="Chunks" value={sum(docs).toLocaleString()} />
        {selection.kind === "collection" && <Row label="Years" value={years.join(", ") || "None set"} />}
        <Row label="Tags" value={tags.join(", ") || "None"} />
        <Row label="Retrieval filter" mono value={`collection = "${selection.collection}"${year ? ` AND year = ${year}` : ""}`} />
        <div className="mt-4"><AskLink params={{ collection: selection.collection, year }} /></div>
      </div>
    );
  }

  const doc = documents.find((d) => d.id === selection.docId);
  if (!doc) return <p className="text-sm text-[#8888aa]">This document was deleted.</p>;
  const chunks = chunksByDoc[doc.id] ?? [];

  if (selection.kind === "document") {
    const s = doc.stats ?? {};
    return (
      <div>
        <p className="text-xs text-[#555570] mb-1">Document</p>
        <h3 className="text-base font-semibold mb-3 break-all">{doc.file_name}</h3>
        <Row label="Status" value={doc.status === "failed" ? <span className="text-red-400">{doc.error || "Failed"}</span> : doc.status} />
        <Row label="Collection" value={doc.collection} />
        <Row label="Year" value={doc.year ?? "Not set"} />
        <Row label="Tags" value={doc.tags.join(", ") || "None"} />
        <Row label="Size" value={doc.file_size_bytes ? formatBytes(doc.file_size_bytes) : "—"} />
        <Row label="Pages" value={s.pages ?? "—"} />
        <Row label="Chunks" value={`${doc.chunk_count}${s.chunkSize ? ` (${s.chunkSize} chars, ${s.chunkOverlap} overlap)` : ""}`} />
        <Row label="Characters" value={s.characters?.toLocaleString() ?? "—"} />
        {s.removedLines !== undefined && <Row label="Header/footer lines removed" value={s.removedLines} />}
        {s.ocr && <Row label="OCR (scanned pages)" value={`${s.ocr.done}/${s.ocr.pages} pages · ${s.ocr.model}`} />}
        <Row label="Embedding model" value={s.embeddingModel ?? "—"} />
        <Row label="Uploaded" value={new Date(doc.created_at).toLocaleString()} />
        <Row label="Document id" mono value={doc.document_id} />
        <div className="mt-4 flex flex-wrap gap-2">
          {doc.status === "ready" && <AskLink params={{ doc: doc.document_id }} />}
          {doc.status === "failed" && (
            <button onClick={() => onRetry(doc)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.1] hover:bg-white/[0.05]">
              Retry processing
            </button>
          )}
          <button
            onClick={() => onDelete(doc)}
            disabled={deletingId === doc.id}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {deletingId === doc.id ? "Deleting…" : "Delete document"}
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === "page") {
    const pageChunks = chunks.filter((c) => c.page_number === selection.page);
    return (
      <div>
        <p className="text-xs text-[#555570] mb-1">Page</p>
        <h3 className="text-base font-semibold mb-3">Page {selection.page ?? "?"} · {doc.file_name}</h3>
        <Row label="Chunks on this page" value={pageChunks.length} />
        <Row label="Characters" value={pageChunks.reduce((n, c) => n + c.content.length, 0).toLocaleString()} />
        <Row label="Chunk indexes" value={pageChunks.map((c) => `#${c.chunk_index}`).join(", ")} />
      </div>
    );
  }

  const chunk = chunks.find((c) => c.id === selection.chunkId);
  if (!chunk) return <p className="text-sm text-[#8888aa]">Chunk not loaded.</p>;
  return (
    <div>
      <p className="text-xs text-[#555570] mb-1">Chunk metadata</p>
      <h3 className="text-base font-semibold mb-3">Chunk #{chunk.chunk_index} · page {chunk.page_number ?? "?"}</h3>
      <p className="text-[13px] leading-relaxed text-[#c8c8dc] bg-[#0f0f13] border border-white/[0.05] rounded-lg p-3 mb-3 whitespace-pre-wrap max-h-64 overflow-y-auto">
        {chunk.content}
      </p>
      <Row label="Vector id" mono value={chunk.id} />
      <Row label="Characters" value={chunk.content.length} />
      <Row label="Document" value={doc.file_name} />
      <Row label="Collection" value={doc.collection} />
      <Row label="Year" value={doc.year ?? "Not set"} />
      <Row label="Tags" value={doc.tags.join(", ") || "None"} />
      <Row label="Embedding model" value={doc.stats?.embeddingModel ?? "—"} />
    </div>
  );
}
