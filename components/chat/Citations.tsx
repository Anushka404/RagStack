"use client";

import type { Components } from "react-markdown";
import type { RetrievalTrace } from "@/types/rag";

/** Turns the answer's [n] markers into links the renderer below shows as citation chips. */
export function linkCitations(markdown: string) {
  return markdown.replace(/\[(\d{1,2})\](?!\()/g, "[$1](#cite-$1)");
}

/** react-markdown overrides: #cite-n links become chips whose tooltip shows passage n. */
export function citationComponents(trace?: RetrievalTrace): Components {
  return {
    a({ href, children }) {
      const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : null;
      if (!n) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      const chunk = trace?.chunks.find((c) => c.contextIndex === n);
      const label = chunk ? `[${n}] ${chunk.fileName} · page ${chunk.pageNumber ?? "?"}\n\n${chunk.preview}` : `Passage ${n}`;
      return (
        <sup>
          <span
            title={label}
            aria-label={chunk ? `Source ${n}: ${chunk.fileName}, page ${chunk.pageNumber ?? "unknown"}` : `Source ${n}`}
            className="mx-0.5 px-1 rounded bg-[#4f6eff]/20 text-[#a8b8ff] text-[10px] font-semibold cursor-help no-underline"
          >
            {n}
          </span>
        </sup>
      );
    },
  };
}

/** The claim check under an answer: how many claims the passages support, and which. */
export function VerificationSummary({ verification, pending }: { verification?: RetrievalTrace["verification"]; pending: boolean }) {
  if (!verification) {
    return pending ? (
      <p className="mt-2 flex items-center gap-2 text-xs text-[#8888aa]">
        <span className="spinner !w-3 !h-3 !border-[1.5px]" /> Checking each claim against the sources…
      </p>
    ) : null;
  }
  if ("error" in verification) {
    return <p className="mt-2 text-xs text-[#8888aa]">Claim check unavailable: {verification.error.slice(0, 160)}</p>;
  }

  const all = verification.supported === verification.total;
  return (
    <details className="mt-2 w-full text-xs">
      <summary className={`cursor-pointer select-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
        all ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"
      }`}>
        {all ? "✓" : "⚠"} {all ? `All ${verification.total} claims` : `${verification.supported} of ${verification.total} claims`} supported by the sources
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5 pl-1">
        {verification.claims.map((c, i) => (
          <li key={i} className="flex gap-2 text-[#b8b8cc]">
            <span className={c.supported ? "text-emerald-400" : "text-amber-400"} aria-label={c.supported ? "Supported" : "Not supported"}>
              {c.supported ? "✓" : "✗"}
            </span>
            <span>
              {c.claim}
              {c.sources.length > 0 && <span className="text-[#8ba0ff]"> [{c.sources.join("][")}]</span>}
              {!c.supported && <span className="text-amber-400/80"> (not found in the sources)</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 pl-1 text-[#555570]">Checked by {verification.model}</p>
    </details>
  );
}
