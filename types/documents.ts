export type DocumentStatus = "uploading" | "parsing" | "embedding" | "ready" | "failed";

/** A row of the `documents` table as returned to the client. */
export interface DocumentRow {
  id: string;
  /** Pinecone documentId metadata value (row id for new uploads, content hash for legacy ones). */
  document_id: string;
  file_name: string;
  chunk_count: number;
  status: DocumentStatus;
  processed_chunks: number;
  error: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

export const DOCUMENTS_BUCKET = "documents";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
