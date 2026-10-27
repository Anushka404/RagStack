/** What the question itself says about where to search (the synopsis' query understanding step). */
export type QueryPlan = {
  /** Years mentioned in the question that exist in the knowledge base. */
  years: number[];
  /** A collection named in the question. */
  collection?: string;
  /** Two or more years: search each one separately so both sides get evidence. */
  compare: boolean;
};

/**
 * Reads years and collection names out of a question, keeping only values that
 * exist in the user's documents so a stray number can't filter everything out.
 * ponytail: regex years and exact collection names; an LLM extractor would also
 * catch "last year" or misspelled collections.
 */
export function understandQuery(
  question: string,
  available: { years: number[]; collections: string[] }
): QueryPlan {
  const mentioned = [...question.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const years = [...new Set(mentioned)].filter((y) => available.years.includes(y)).sort();
  const lower = question.toLowerCase();
  const collection = available.collections
    .filter((c) => c.length >= 3)
    .sort((a, b) => b.length - a.length)
    .find((c) => lower.includes(c.toLowerCase()));
  return { years, ...(collection ? { collection } : {}), compare: years.length >= 2 };
}
