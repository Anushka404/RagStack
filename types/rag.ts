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
};

export type RetrievedDoc = {
  content: string;
  metadata: ChunkMetadata;
};
