import { Document } from "@langchain/core/documents";
import { ChunkMetadata } from "@/types/rag";

/**
 * Attaches rich metadata (including userId) to each chunk Document.
 */
export function attachMetadata(
  chunks: Document[],
  opts: {
    documentId: string;
    fileName: string;
    uploadedAt: string;
    userId: string;
    collection: string;
    year: number | null;
    tags: string[];
  }
): Document<ChunkMetadata>[] {
  const totalChunks = chunks.length;

  return chunks.map((chunk, index) => {
    const pageNumber: number | null =
      chunk.metadata?.loc?.pageNumber ?? chunk.metadata?.pageNumber ?? null;

    const textPreview = chunk.pageContent.trim().slice(0, 200);

    const metadata: ChunkMetadata = {
      documentId: opts.documentId,
      fileName: opts.fileName,
      pageNumber,
      chunkIndex: index,
      totalChunks,
      source: "pdf_upload",
      uploadedAt: opts.uploadedAt,
      textPreview,
      userId: opts.userId,
      // Filterable in Pinecone; null year / empty tags are dropped before upsert.
      collection: opts.collection,
      year: opts.year,
      tags: opts.tags,
    };

    return new Document({ pageContent: chunk.pageContent, metadata });
  });
}
