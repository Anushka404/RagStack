import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { listEvalCases } from "@/lib/db/eval";
import { listUserDocuments } from "@/lib/db/documents";
import { hybridRetrieve, RetrievalMode } from "@/lib/rag/hybrid";
import { firstHitRank, summarize } from "@/lib/rag/evaluate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Each benchmark question is run through every mode; retrieval only, so no LLM quota is used. */
const MODES: { mode: RetrievalMode; label: string }[] = [
  { mode: "semantic", label: "Semantic only" },
  { mode: "hybrid", label: "Semantic + keyword" },
  { mode: "full", label: "Full pipeline (+ query understanding, rerank)" },
];
/** Keeps a run inside one serverless request. */
const MAX_CASES = 15;

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [cases, documents] = await Promise.all([listEvalCases(supabase, user.id), listUserDocuments(supabase, user.id)]);
    const ready = documents.filter((d) => d.status === "ready");
    const available = {
      years: [...new Set(ready.map((d) => d.year).filter((y): y is number => y !== null))],
      collections: [...new Set(ready.map((d) => d.collection))],
    };

    const rows: { id: string; question: string; results: Record<string, { rank: number | null; ms: number }> }[] = [];
    for (const c of cases.slice(0, MAX_CASES)) {
      const results: Record<string, { rank: number | null; ms: number }> = {};
      for (const { mode } of MODES) {
        const t = Date.now();
        const { docs } = await hybridRetrieve(supabase, user.id, c.question, {}, available, mode);
        results[mode] = { rank: firstHitRank(docs, c), ms: Date.now() - t };
      }
      rows.push({ id: c.id, question: c.question, results });
    }

    const modes = MODES.map(({ mode, label }) => ({
      mode,
      label,
      ...summarize(rows.map((r) => r.results[mode].rank), rows.map((r) => r.results[mode].ms)),
    }));
    return NextResponse.json({ modes, rows, skipped: Math.max(0, cases.length - MAX_CASES) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Benchmark failed" }, { status: 500 });
  }
}
