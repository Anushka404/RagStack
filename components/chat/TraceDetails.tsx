"use client";

import { RetrievalTrace } from "@/types/rag";

function describeFilters(f: RetrievalTrace["filters"]) {
  const parts = [
    f.collection && `collection = "${f.collection}"`,
    f.years?.length && `year in [${f.years.join(", ")}]`,
    f.documentIds?.length && `${f.documentIds.length} selected document${f.documentIds.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" AND ") : "Whole knowledge base";
}

function describeDetected(d: NonNullable<RetrievalTrace["detected"]>) {
  const parts = [
    d.years.length && `year${d.years.length > 1 ? "s" : ""} ${d.years.join(", ")}`,
    d.collection && `collection "${d.collection}"`,
  ].filter(Boolean);
  if (!parts.length) return "Nothing to filter on";
  return `${parts.join(", ")}${d.compare ? " → comparison: one search per year" : ""}`;
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

/** "How this answer was found": the retrieval pipeline's work for one answer. */
export function TraceDetails({ trace }: { trace: RetrievalTrace }) {
  const top = Math.max(...trace.chunks.map((c) => c.score), 0.0001);
  const stages = Object.entries(trace.timings).filter(([k]) => k !== "total");
  const inContext = trace.chunks.filter((c) => c.contextIndex).length;
  // Older answers (before hybrid retrieval) have plain similarity scores only.
  const hybrid = !!trace.searches;

  return (
    <details className="mt-2 w-full rounded-xl border border-white/[0.07] bg-[#16161e] text-xs text-[#b8b8cc] open:pb-3">
      <summary className="cursor-pointer select-none px-3 py-2 text-[#8ba0ff] hover:text-[#a8b8ff]">
        How this answer was found · {hybrid ? `${inContext} of ${trace.chunks.length}` : trace.chunks.length} chunks · {(trace.timings.total / 1000).toFixed(1)} s
      </summary>
      <div className="px-3 flex flex-col gap-3">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1">
          <span className="text-[#555570]">Searched for</span>
          <span className="text-[#e8e8f0]">{trace.retrievalQuery ?? trace.query}</span>
          {trace.retrievalQuery && (<><span className="text-[#555570]">Rewritten from</span><span>{trace.query}</span></>)}
          {trace.detected && (<><span className="text-[#555570]">Read from question</span><span>{describeDetected(trace.detected)}</span></>)}
          <span className="text-[#555570]">Filters</span>
          <span className="font-mono text-[11px]">{describeFilters(trace.filters)}</span>
          {trace.searches && (
            <>
              <span className="text-[#555570]">Searches</span>
              <span>
                {trace.searches.map((s) => `${s.label === "all" ? "" : `${s.label}: `}${s.dense} semantic + ${s.keyword} keyword hits`).join(" · ")}
              </span>
            </>
          )}
          {trace.reranker && (<><span className="text-[#555570]">Reranker</span><span className="font-mono text-[11px] break-all">{trace.reranker}</span></>)}
          <span className="text-[#555570]">Context sent</span>
          <span>{trace.contextChars.toLocaleString()} chars (≈{Math.round(trace.contextChars / 4).toLocaleString()} tokens)</span>
          <span className="text-[#555570]">Answered by</span>
          <span className="font-mono text-[11px] break-all">{trace.model}</span>
        </div>

        <div>
          <p className="text-[#555570] mb-1.5">
            {hybrid ? "Final chunks after fusion and reranking (S = semantic rank, K = keyword rank)" : "Retrieved chunks, ranked by similarity"}
          </p>
          {trace.chunks.length === 0 ? (
            <p>No chunks matched these filters.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {trace.chunks.map((c, i) => (
                <li key={`${c.fileName}-${c.chunkIndex}-${i}`} title={c.preview} className={c.dropped ? "opacity-45" : ""}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-[#555570]">{c.contextIndex ? `[${c.contextIndex}]` : "–"}</span>
                    <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#d0d0e0]">
                      {c.fileName} · p. {c.pageNumber ?? "?"} · #{c.chunkIndex}
                      {c.dropped && <span className="text-[#8888aa]"> · left out: {c.dropped}</span>}
                    </span>
                    {c.signals?.denseRank && <span className="px-1 rounded bg-[#4f6eff]/15 text-[#8ba0ff]">S{c.signals.denseRank}</span>}
                    {c.signals?.keywordRank && <span className="px-1 rounded bg-emerald-500/15 text-emerald-400">K{c.signals.keywordRank}</span>}
                    <span className="font-mono text-[11px] text-[#8ba0ff] w-12 text-right">{c.score.toFixed(3)}</span>
                  </div>
                  <div className="ml-8 mt-0.5 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full bg-[#4f6eff]" style={{ width: `${Math.max(4, (c.score / top) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {stages.map(([stage, n]) => (
            <span key={stage} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.05]">
              {stage} <span className="text-[#e8e8f0]">{ms(n)}</span>
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}
