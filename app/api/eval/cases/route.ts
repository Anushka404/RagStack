import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { createEvalCase, listEvalCases } from "@/lib/db/eval";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ cases: await listEvalCases(supabase, user.id) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load test questions" }, { status: 500 });
  }
}

/** Adds a benchmark question: { question, expectedDocumentId, expectedPages? }. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const expectedDocumentId = typeof body.expectedDocumentId === "string" ? body.expectedDocumentId : "";
    if (question.length < 3 || question.length > 500) {
      return NextResponse.json({ error: "Questions must be 3 to 500 characters." }, { status: 400 });
    }
    if (!expectedDocumentId) {
      return NextResponse.json({ error: "Pick the document that answers the question." }, { status: 400 });
    }
    const pages: number[] = Array.isArray(body.expectedPages)
      ? [...new Set(body.expectedPages.map(Number).filter((p: number) => Number.isInteger(p) && p > 0 && p < 100000) as number[])].slice(0, 20)
      : [];

    const created = await createEvalCase(supabase, user.id, {
      question,
      expected_document_id: expectedDocumentId,
      expected_pages: pages,
    });
    return NextResponse.json({ case: created });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add test question" }, { status: 500 });
  }
}
