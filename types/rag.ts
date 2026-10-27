import type { Verification } from "@/lib/rag/claims";

export type ChunkMetadata = {
  documentId: string;
  fileName: string;
  pageNumber: number | null;
  chunkIndex: number;
  totalChunks: number;
  source: "pdf_upload";
  uploadedAt: string;
  textPreview: string;
  userId: string;
  collection: string;
  year: number | null;
  tags: string[];
};

/** How a chunk was found; each retrieval stage fills in its part. */
export type RetrievalSignals = {
  denseRank?: number;
  denseScore?: number;
  keywordRank?: number;
  keywordScore?: number;
  /** Reciprocal rank fusion of the dense and keyword ranks. */
  rrf?: number;
  rerankScore?: number;
  /** Sub-search that found it, e.g. "year 2026" in a comparison. */
  search?: string;
};

export type RetrievedDoc = {
  /** Same as the Pinecone vector id: "<documentId>#<chunkIndex>". */
  id: string;
  content: string;
  metadata: ChunkMetadata;
  /** Final relevance: rerank score when available, else fused or vector similarity. */
  score: number;
  signals: RetrievalSignals;
};

/** Restricts retrieval to part of the user's knowledge base (the synopsis' namespace router). */
export type RetrievalFilters = {
  collection?: string;
  years?: number[];
  /** Pinecone documentId values (DocumentRow.document_id). */
  documentIds?: string[];
};

/** One retrieved chunk as shown in the "How this answer was found" panel. */
export type TraceChunk = {
  fileName: string;
  pageNumber: number | null;
  chunkIndex: number;
  score: number;
  preview: string;
  signals?: RetrievalSignals;
  /** Position in the prompt context ([n]), or why it was left out. */
  contextIndex?: number;
  dropped?: string;
};

/** What the pipeline did for one answer; sent to the client and stored on the message. */
export type RetrievalTrace = {
  query: string;
  retrievalQuery?: string;
  filters: RetrievalFilters;
  /** Filters taken from the question itself (years, collection) on top of the chosen ones. */
  detected?: { years: number[]; collection?: string; compare: boolean };
  searches?: { label: string; dense: number; keyword: number }[];
  reranker?: string;
  chunks: TraceChunk[];
  contextChars: number;
  model: string;
  timings: Record<string, number>;
  /** Claim check of the answer against the passages; arrives after the answer. */
  verification?: Verification;
};
