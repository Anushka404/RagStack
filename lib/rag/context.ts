import type { RetrievedDoc } from "@/types/rag";

/** Context budget for the prompt: ~3,000 tokens at ~4 characters per token. */
export const CONTEXT_BUDGET_CHARS = 12_000;
/** Word overlap above which two chunks count as the same evidence (e.g. a PDF uploaded twice). */
const DUPLICATE_SIMILARITY = 0.85;

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

function jaccard(a: Set<string>, b: Set<string>) {
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared++; });
  return shared / (a.size + b.size - shared || 1);
}

export type AssembledContext = {
  /** Prompt text; each passage starts with its [n] label. */
  context: string;
  /** Chunks in the prompt, in [1..n] order. */
  used: RetrievedDoc[];
  dropped: { doc: RetrievedDoc; reason: string }[];
};

/**
 * Context builder: takes chunks in relevance order, skips near-duplicates, stops at
 * the character budget, then orders what's left by document and page so the
 * model reads each source in sequence. Passages are numbered for citations.
 */
export function assembleContext(docs: RetrievedDoc[], budget = CONTEXT_BUDGET_CHARS): AssembledContext {
  const picked: { doc: RetrievedDoc; words: Set<string> }[] = [];
  const dropped: AssembledContext["dropped"] = [];
  let size = 0;

  for (const doc of docs) {
    const w = words(doc.content);
    if (picked.some((p) => jaccard(p.words, w) >= DUPLICATE_SIMILARITY)) {
      dropped.push({ doc, reason: "near-duplicate" });
    } else if (size + doc.content.length > budget) {
      dropped.push({ doc, reason: "over context budget" });
    } else {
      picked.push({ doc, words: w });
      size += doc.content.length;
    }
  }

  const used = picked
    .map((p) => p.doc)
    .sort((a, b) =>
      a.metadata.fileName.localeCompare(b.metadata.fileName) ||
      (a.metadata.pageNumber ?? 0) - (b.metadata.pageNumber ?? 0) ||
      a.metadata.chunkIndex - b.metadata.chunkIndex
    );

  const context = used
    .map((doc, i) => {
      const m = doc.metadata;
      const label = [m.fileName, m.year, m.pageNumber ? `page ${m.pageNumber}` : null].filter(Boolean).join(" · ");
      return `[${i + 1}] ${label}\n${doc.content}`;
    })
    .join("\n\n---\n\n");

  return { context, used, dropped };
}
