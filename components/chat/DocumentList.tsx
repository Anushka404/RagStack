"use client";

import { DocumentRow } from "@/types/documents";

interface DocumentListProps {
  documents: DocumentRow[];
  activeId: string | null;
  deletingIds: Set<string>;
  onDelete: (doc: DocumentRow) => void;
  onRetry: (doc: DocumentRow) => void;
}

function statusLine(doc: DocumentRow): string {
  switch (doc.status) {
    case "uploading": return "Queued…";
    case "parsing": return "Reading PDF…";
    case "embedding":
      return doc.chunk_count > 0
        ? `Embedding ${doc.processed_chunks}/${doc.chunk_count}…`
        : "Embedding…";
    case "failed": return doc.error || "Processing failed";
    default: return `${doc.chunk_count} chunks indexed`;
  }
}

export function DocumentList({ documents, activeId, deletingIds, onDelete, onRetry }: DocumentListProps) {
  if (documents.length === 0) {
    return <p className="text-[13px] text-[#555570] italic">No document uploaded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-0.5">
      {documents.map((doc) => {
        const busy = doc.status !== "ready" && doc.status !== "failed";
        const deleting = deletingIds.has(doc.id);
        const pct = doc.chunk_count > 0 ? Math.round((doc.processed_chunks / doc.chunk_count) * 100) : 0;

        return (
          <div
            key={doc.id}
            className={`group flex items-start gap-2.5 p-2.5 bg-[#1e1e2a] border rounded-xl transition ${
              doc.id === activeId ? "border-[#4f6eff]/60" : "border-white/[0.07]"
            } ${deleting ? "opacity-50" : ""}`}
          >
            <span className="text-lg flex-shrink-0">📄</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#e8e8f0] overflow-hidden text-ellipsis whitespace-nowrap" title={doc.file_name}>
                {doc.file_name}
              </p>
              <p
                className={`text-[11px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap ${
                  doc.status === "failed" ? "text-red-400" : busy ? "text-[#8ba0ff]" : "text-[#8888aa]"
                }`}
                title={statusLine(doc)}
              >
                {deleting ? "Deleting…" : statusLine(doc)}
              </p>
              {busy && !deleting && (
                <div className="h-1 mt-1.5 bg-[#0f0f13] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r from-[#4f6eff] to-[#8ba0ff] rounded-full transition-all duration-500 ${
                      doc.status === "embedding" ? "" : "w-1/4 animate-pulse"
                    }`}
                    style={doc.status === "embedding" ? { width: `${Math.max(pct, 3)}%` } : undefined}
                  />
                </div>
              )}
              {doc.status === "failed" && !deleting && (
                <button onClick={() => onRetry(doc)} className="text-[11px] text-[#6381ff] hover:underline mt-0.5">
                  Retry
                </button>
              )}
            </div>
            <button
              onClick={() => onDelete(doc)}
              disabled={deleting}
              aria-label={`Delete ${doc.file_name}`}
              title="Delete document"
              className="flex-shrink-0 p-1 rounded-md text-[#555570] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
