import { chunkVectorId, getVectorStore } from "@/lib/pinecone/vector-store";
import { ChunkMetadata, RetrievalFilters, RetrievedDoc } from "@/types/rag";

const TOP_K = 20;

/** Validates filters from a request body; anything malformed is dropped rather than trusted. */
export function parseFilters(raw: unknown): RetrievalFilters {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const filters: RetrievalFilters = {};
  if (typeof r.collection === "string" && r.collection.trim()) filters.collection = r.collection.trim().slice(0, 60);
  if (Array.isArray(r.years)) {
    const years = r.years.map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2100);
    if (years.length) filters.years = [...new Set(years)].slice(0, 10);
  }
  if (Array.isArray(r.documentIds)) {
    const ids = r.documentIds.filter((id): id is string => typeof id === "string" && id.length <= 100);
    if (ids.length) filters.documentIds = ids.slice(0, 50);
  }
  return filters;
}

/** Pinecone metadata filter for the chosen collection / years / documents (undefined = everything). */
export function toPineconeFilter(f: RetrievalFilters) {
  const filter: Record<string, unknown> = {};
  if (f.collection) filter.collection = { $eq: f.collection };
  if (f.years?.length) filter.year = { $in: f.years };
  if (f.documentIds?.length) filter.documentId = { $in: f.documentIds };
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * Semantic search: the top-K chunks from the user's Pinecone namespace, restricted
 * by filters. Deduplicates chunks by vector id.
 */
export async function retrieveDocuments(
  query: string,
  userId: string,
  filters: RetrievalFilters = {},
  k = TOP_K
): Promise<RetrievedDoc[]> {
  const vectorStore = await getVectorStore(userId);
  const results = await vectorStore.similaritySearchWithScore(query, k, toPineconeFilter(filters));

  const seen = new Set<string>();
  const unique: RetrievedDoc[] = [];

  for (const [doc, score] of results) {
    const meta = doc.metadata as Partial<ChunkMetadata>;
    const key = chunkVectorId(meta.documentId ?? "unknown", meta.chunkIndex ?? 0);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      id: key,
      content: doc.pageContent,
      score,
      signals: { denseRank: unique.length + 1, denseScore: score },
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
        collection: meta.collection ?? "General",
        year: meta.year ?? null,
        tags: meta.tags ?? [],
      },
    });
  }

  return unique;
}
