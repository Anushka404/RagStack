import { SupabaseClient } from "@supabase/supabase-js";
import { retrieveDocuments } from "./retrieve";
import { searchChunksKeyword } from "@/lib/db/chunks";
import { reciprocalRankFusion } from "./fusion";
import { rerank, RERANK_MODEL } from "./rerank";
import { understandQuery, QueryPlan } from "./query-understanding";
import { RetrievalFilters, RetrievedDoc } from "@/types/rag";

/** Chunks handed to the context builder for a normal question. */
export const FINAL_K = 6;

export type RetrievalMode = "semantic" | "hybrid" | "full";
/** Fused candidates per search sent to the reranker. */
const RERANK_CANDIDATES = 20;

export type HybridResult = {
  /** Final chunks, best first (grouped by year for comparisons). */
  docs: RetrievedDoc[];
  plan: QueryPlan;
  /** Filters actually used: the chosen ones plus any taken from the question. */
  filters: RetrievalFilters;
  searches: { label: string; dense: number; keyword: number }[];
  reranker: string;
  timings: { search: number; rerank: number };
};

/**
 * Multi-index retrieval (synopsis layer 3): query understanding → semantic (Pinecone)
 * and keyword (Postgres full-text) search in parallel → reciprocal rank fusion →
 * cross-encoder reranking. A question naming two or more years runs one search per
 * year so a comparison gets evidence for each side.
 */
export async function hybridRetrieve(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  chosen: RetrievalFilters,
  available: { years: number[]; collections: string[] },
  /** Ablation for the benchmark: "semantic" = Pinecone only, "hybrid" = + keyword fusion, "full" = + query understanding and reranking. */
  mode: RetrievalMode = "full"
): Promise<HybridResult> {
  const plan = mode === "full" ? understandQuery(query, available) : { years: [], compare: false };
  // What the user picked in the UI wins over what the question mentions.
  const filters: RetrievalFilters = {
    ...chosen,
    ...(!chosen.collection && plan.collection ? { collection: plan.collection } : {}),
    ...(!chosen.years?.length && plan.years.length ? { years: plan.years } : {}),
  };
  const compare = plan.compare && !chosen.years?.length;
  const groups = compare
    ? plan.years.map((y) => ({ label: `year ${y}`, filters: { ...filters, years: [y] } }))
    : [{ label: "all", filters }];

  const startedAt = Date.now();
  const searched = await Promise.all(
    groups.map(async (g) => {
      const [dense, keyword] = await Promise.all([
        retrieveDocuments(query, userId, g.filters),
        // Keyword search is additive: if it fails, semantic results still stand.
        mode === "semantic"
          ? Promise.resolve([] as RetrievedDoc[])
          : searchChunksKeyword(supabase, query, g.filters).catch((err) => {
              console.warn("Keyword search failed:", err);
              return [] as RetrievedDoc[];
            }),
      ]);
      const fused = reciprocalRankFusion([dense, keyword])
        .slice(0, RERANK_CANDIDATES)
        .map((d) => ({ ...d, signals: { ...d.signals, search: g.label } }));
      return { label: g.label, dense: dense.length, keyword: keyword.length, fused };
    })
  );
  const searchedAt = Date.now();

  // Rerank each group on its own so a comparison keeps the best chunks of every year.
  let reranker = mode === "full" ? RERANK_MODEL : "off";
  const perGroup = groups.length === 1 ? FINAL_K : Math.max(3, Math.ceil(FINAL_K / groups.length));
  const ranked = await Promise.all(
    searched.map(async (s) => {
      if (mode !== "full") return s.fused.slice(0, perGroup);
      try {
        return (await rerank(query, s.fused)).slice(0, perGroup);
      } catch (err) {
        reranker = `skipped: ${err instanceof Error ? err.message : "reranker unavailable"}`;
        return s.fused.slice(0, perGroup);
      }
    })
  );

  return {
    docs: ranked.flat(),
    plan,
    filters,
    searches: searched.map(({ label, dense, keyword }) => ({ label, dense, keyword })),
    reranker,
    timings: { search: searchedAt - startedAt, rerank: Date.now() - searchedAt },
  };
}
