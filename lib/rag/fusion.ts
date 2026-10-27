import type { RetrievedDoc } from "@/types/rag";

/** Standard RRF damping constant (Cormack et al., 2009): rank 1 → 1/61, rank 10 → 1/70. */
const RRF_K = 60;

/**
 * Reciprocal rank fusion: merges ranked lists by summing 1/(k + rank) per chunk,
 * so a chunk ranked well by both semantic and keyword search rises to the top.
 * Uses ranks only, which sidesteps comparing cosine scores with ts_rank scores.
 */
export function reciprocalRankFusion(lists: RetrievedDoc[][]): RetrievedDoc[] {
  const fused = new Map<string, RetrievedDoc>();
  for (const list of lists) {
    list.forEach((doc, i) => {
      const prev = fused.get(doc.id);
      const rrf = (prev?.signals.rrf ?? 0) + 1 / (RRF_K + i + 1);
      fused.set(doc.id, {
        ...(prev ?? doc),
        signals: { ...prev?.signals, ...doc.signals, rrf },
      });
    });
  }
  return [...fused.values()]
    .map((d) => ({ ...d, score: d.signals.rrf ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
