import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { getRecentAnswers } from "@/lib/db/eval";
import { isNotFoundAnswer } from "@/lib/ai/prompts";

const STAGE_ORDER = ["prepare", "search", "rerank", "generate", "verify"];
/** Stage names used by answers stored before hybrid retrieval. */
const LEGACY_STAGES: Record<string, string> = { rewrite: "prepare", retrieve: "search" };

/** Aggregates over the user's recent answers: latency per stage, faithfulness, not-found rate. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const answers = await getRecentAnswers(supabase, user.id);
    const stageTotals: Record<string, { sum: number; n: number }> = {};
    let claims = 0, supported = 0, verified = 0, notFound = 0, contextChars = 0;

    for (const { content, trace } of answers) {
      for (const [name, ms] of Object.entries(trace.timings ?? {})) {
        const stage = LEGACY_STAGES[name] ?? name;
        stageTotals[stage] ??= { sum: 0, n: 0 };
        stageTotals[stage].sum += ms;
        stageTotals[stage].n++;
      }
      const v = trace.verification;
      if (v && "claims" in v) { verified++; claims += v.total; supported += v.supported; }
      if (isNotFoundAnswer(content)) notFound++;
      contextChars += trace.contextChars ?? 0;
    }

    const avg = (k: string) => (stageTotals[k] ? Math.round(stageTotals[k].sum / stageTotals[k].n) : null);
    return NextResponse.json({
      answers: answers.length,
      avgTotalMs: avg("total"),
      stages: STAGE_ORDER.filter((k) => stageTotals[k]).map((k) => ({ stage: k, avgMs: avg(k) })),
      verifiedAnswers: verified,
      claims,
      supportedClaims: supported,
      notFound,
      avgContextTokens: answers.length ? Math.round(contextChars / answers.length / 4) : 0,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load metrics" }, { status: 500 });
  }
}
