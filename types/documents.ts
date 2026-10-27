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
  /** Grouping metadata: the "namespace" a query can be restricted to. */
  collection: string;
  year: number | null;
  tags: string[];
  stats: DocumentStats;
  created_at: string;
}

/** Ingestion facts recorded once the file is parsed, shown in the upload steps and the tree. */
export interface DocumentStats {
  pages?: number;
  characters?: number;
  removedLines?: number;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  /** Scanned pages read by OCR: progress while parsing, final count after. */
  ocr?: { pages: number; done: number; model: string };
}

/** A stored chunk; its id is also the Pinecone vector id. */
export interface ChunkRow {
  id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
}

export const DOCUMENTS_BUCKET = "documents";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Upload formats by extension, with the MIME type the file is stored under. */
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Lowercase extension of a file name if it is a supported format, else null. */
export function fileExtension(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ext in FILE_TYPES ? ext : null;
}
