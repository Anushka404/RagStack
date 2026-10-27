import { getPineconeClient } from "@/lib/pinecone/client";
import { RetrievedDoc } from "@/types/rag";

/** Pinecone-hosted cross-encoder; free on the Starter plan with the same API key. */
export const RERANK_MODEL = "bge-reranker-v2-m3";

/**
 * Reranking: a cross-encoder reads the question and each candidate together and
 * scores relevance directly, which is sharper than comparing two separate embeddings.
 * Returns candidates sorted by rerank score.
 */
export async function rerank(query: string, docs: RetrievedDoc[]): Promise<RetrievedDoc[]> {
  if (docs.length === 0) return docs;
  const res = await getPineconeClient().inference.rerank(
    RERANK_MODEL,
    query,
    docs.map((d) => ({ text: d.content })),
    { topN: docs.length, returnDocuments: false, parameters: { truncate: "END" } }
  );
  return res.data.map(({ index, score }) => ({
    ...docs[index],
    score,
    signals: { ...docs[index].signals, rerankScore: score },
  }));
}
