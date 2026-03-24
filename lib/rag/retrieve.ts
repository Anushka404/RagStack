import { Document } from "@langchain/core/documents";
import { getVectorStore } from "@/lib/pinecone/vector-store";
import { ChunkMetadata, RetrievedDoc } from "@/types/rag";

const TOP_K = 8;

/**
 * Retrieves top-K relevant chunks from the user's Pinecone namespace.
 * Deduplicates chunks by (documentId + chunkIndex).
 */
export async function retrieveDocuments(query: string, userId: string): Promise<RetrievedDoc[]> {
  const vectorStore = await getVectorStore(userId);
  const retriever = vectorStore.asRetriever({ k: TOP_K });

  const docs: Document[] = await retriever.invoke(query);

  const seen = new Set<string>();
  const unique: RetrievedDoc[] = [];

  for (const doc of docs) {
    const meta = doc.metadata as Partial<ChunkMetadata>;
    const key = `${meta.documentId ?? ""}-${meta.chunkIndex ?? Math.random()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        content: doc.pageContent,
        metadata: {
          documentId: meta.documentId ?? "unknown",
          fileName: meta.fileName ?? "unknown",
          pageNumber: meta.pageNumber ?? null,
          chunkIndex: meta.chunkIndex ?? 0,
          totalChunks: meta.totalChunks ?? 0,
          source: "pdf_upload",
          uploadedAt: meta.uploadedAt ?? "",
          textPreview: meta.textPreview ?? doc.pageContent.slice(0, 200),
          userId: meta.userId ?? "",
        },
      });
    }
  }

  return unique;
}

/**
 * Builds a single context string from a list of retrieved documents.
 */
export function buildContext(docs: RetrievedDoc[]): string {
  return docs
    .map((doc) => {
      const page = doc.metadata.pageNumber ? `[Page ${doc.metadata.pageNumber}]` : "";
      return `${page}\n${doc.content}`.trim();
    })
    .join("\n\n---\n\n");
}
