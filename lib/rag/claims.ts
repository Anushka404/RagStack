/** One factual claim from an answer and whether the passages back it. */
export type Claim = { claim: string; supported: boolean; sources: number[] };

export type Verification =
  | { claims: Claim[]; supported: number; total: number; model: string }
  | { error: string };

const MAX_CLAIMS = 8;

/**
 * Parses the verifier's JSON reply, tolerating code fences or prose around it.
 * Passage numbers outside 1..passageCount are dropped. Returns null if unusable.
 */
export function parseClaims(raw: string, passageCount: number): Claim[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  const list = (parsed as { claims?: unknown }).claims;
  if (!Array.isArray(list)) return null;
  const claims = list.flatMap((c): Claim[] => {
    if (!c || typeof c !== "object") return [];
    const { claim, supported, sources } = c as Record<string, unknown>;
    if (typeof claim !== "string" || !claim.trim()) return [];
    const ok = supported === true || supported === "true";
    const nums = Array.isArray(sources) ? sources.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= passageCount) : [];
    return [{ claim: claim.trim(), supported: ok, sources: [...new Set(nums)] }];
  });
  return claims.length ? claims.slice(0, MAX_CLAIMS) : null;
}

/** Passage numbers the answer cites as [n], in first-cited order, limited to 1..passageCount. */
export function extractCitations(answer: string, passageCount: number): number[] {
  const nums = [...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
  return [...new Set(nums.filter((n) => n >= 1 && n <= passageCount))];
}
