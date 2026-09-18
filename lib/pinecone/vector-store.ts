import type { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
import { getPineconeClient, PINECONE_INDEX_NAME } from "./client";
import { embeddings } from "@/lib/ai/embeddings";

/**
 * Returns a LangChain PineconeStore scoped to the user's namespace.
 */
export async function getVectorStore(namespace: string): Promise<PineconeStore> {
  const pinecone = getPineconeClient();
  const index = pinecone.index(PINECONE_INDEX_NAME).namespace(namespace);
  return PineconeStore.fromExistingIndex(embeddings, { pineconeIndex: index as any, namespace });
}

/** Vector id for a chunk; the documentId prefix lets a document's vectors be listed and deleted. */
export function chunkVectorId(documentId: string, chunkIndex: number) {
  return `${documentId}#${chunkIndex}`;
}

/**
 * Embeds and upserts chunks into the user's namespace. Ids are deterministic,
 * so re-running a batch after a timeout overwrites instead of duplicating.
 */
export async function upsertChunks(
  docs: Document<{ documentId: string; chunkIndex: number }>[],
  namespace: string
): Promise<void> {
  if (docs.length === 0) return;
  const store = await getVectorStore(namespace);
  const ids = docs.map((d) => chunkVectorId(d.metadata.documentId, d.metadata.chunkIndex));
  await store.addDocuments(docs, { ids });
}

/**
 * Deletes every vector belonging to a document from the user's namespace.
 */
export async function deleteDocumentVectors(namespace: string, documentId: string): Promise<void> {
  const ns = getPineconeClient().index(PINECONE_INDEX_NAME).namespace(namespace);

  // Current uploads: ids are "<documentId>#<n>", listable by prefix (serverless indexes).
  try {
    let paginationToken: string | undefined;
    do {
      const page = await ns.listPaginated({ prefix: `${documentId}#`, paginationToken });
      const ids = (page.vectors ?? []).map((v) => v.id).filter((id): id is string => !!id);
      if (ids.length) await ns.deleteMany(ids);
      paginationToken = page.pagination?.next;
    } while (paginationToken);
  } catch (err) {
    console.warn("Prefix delete unavailable, falling back to metadata query:", err);
  }

  // Legacy uploads used random ids: find them through a metadata-filtered query.
  const { dimension } = await getIndexStats();
  if (!dimension) return;
  const probe = new Array(dimension).fill(1 / Math.sqrt(dimension));
  const deleted = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const res = await ns.query({
      vector: probe,
      topK: 1000,
      filter: { documentId: { $eq: documentId } },
    });
    const ids = res.matches.map((m) => m.id).filter((id) => !deleted.has(id));
    if (ids.length === 0) break;
    await ns.deleteMany(ids);
    ids.forEach((id) => deleted.add(id));
  }
  invalidateIndexStats();
}

type IndexStats = Awaited<ReturnType<ReturnType<Pinecone["index"]>["describeIndexStats"]>>;

const STATS_TTL_MS = 60_000;
let statsCache: { stats: IndexStats; at: number } | null = null;

export function invalidateIndexStats() {
  statsCache = null;
}

/**
 * Returns stats for the full index (all namespaces). describeIndexStats is slow,
 * so results are cached briefly per server instance; pass fresh after writes.
 */
export async function getIndexStats({ fresh = false }: { fresh?: boolean } = {}) {
  if (!fresh && statsCache && Date.now() - statsCache.at < STATS_TTL_MS) {
    return statsCache.stats;
  }
  const pinecone = getPineconeClient();
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();
  statsCache = { stats, at: Date.now() };
  return stats;
}
