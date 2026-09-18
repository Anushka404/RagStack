import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { processDocumentStep } from "@/lib/rag/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs one time-boxed ingestion step; call again until status is "ready" or "failed". */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const retry = req.nextUrl.searchParams.get("retry") === "1";
    const document = await processDocumentStep(supabase, user.id, id, { retry });
    if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ document });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
