import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getIndexStats } from "@/lib/pinecone/vector-store";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getIndexStats();
    const userNs = stats.namespaces?.[user.id];

    return NextResponse.json({
      totalVectors: stats.totalRecordCount ?? 0,
      userVectors: userNs?.recordCount ?? 0,
      dimension: stats.dimension ?? 1536,
      namespaceCount: Object.keys(stats.namespaces ?? {}).length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to get stats";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
