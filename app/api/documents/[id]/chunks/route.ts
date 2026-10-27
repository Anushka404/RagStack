import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { getDocumentChunks } from "@/lib/db/chunks";

/** Stored chunks of one document, for the knowledge-base tree. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const chunks = await getDocumentChunks(supabase, user.id, id);
    return NextResponse.json({ chunks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load chunks";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
