import type { RetrievedDoc } from "@/types/rag";

/** A benchmark question and where its answer lives. */
export type EvalCase = {
  id: string;
  question: string;
  expected_document_id: string;
  /** Empty = any page of the document counts. */
  expected_pages: number[];
};

/** 1-based rank of the first retrieved chunk from the expected document and page, or null if none. */
export function firstHitRank(docs: Pick<RetrievedDoc, "metadata">[], c: EvalCase): number | null {
  const i = docs.findIndex(
    (d) =>
      d.metadata.documentId === c.expected_document_id &&
      (c.expected_pages.length === 0 || c.expected_pages.includes(d.metadata.pageNumber ?? -1))
  );
  return i === -1 ? null : i + 1;
}

/**
 * Retrieval quality over a benchmark: hit rate (share of questions whose evidence
 * was retrieved at all) and MRR (mean of 1/rank; 1.0 = always ranked first).
 */
export function summarize(ranks: (number | null)[], latenciesMs: number[]) {
  const n = ranks.length || 1;
  return {
    hitRate: ranks.filter((r) => r !== null).length / n,
    mrr: ranks.reduce<number>((s, r) => s + (r ? 1 / r : 0), 0) / n,
    avgMs: Math.round(latenciesMs.reduce((s, x) => s + x, 0) / (latenciesMs.length || 1)),
  };
}
