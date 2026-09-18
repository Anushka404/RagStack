import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { getIndexStats } from "@/lib/pinecone/vector-store";
import { countUserDocuments } from "@/lib/db/documents";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [stats, documentCount] = await Promise.all([
      getIndexStats(),
      countUserDocuments(supabase, user.id),
    ]);

    // Only this user's namespace is exposed; other users' counts stay server-side.
    return NextResponse.json({
      userVectors: stats.namespaces?.[user.id]?.recordCount ?? 0,
      documentCount,
      dimension: stats.dimension ?? 1536,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to get stats";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
