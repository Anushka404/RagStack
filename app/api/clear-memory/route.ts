import { NextRequest, NextResponse } from "next/server";
import { clearThread } from "@/lib/rag/memory";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteThread } from "@/lib/db/threads";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadId = (body.threadId as string) || "anonymous";

    // Clear in-memory
    clearThread(threadId);

    // Clear from DB (cascade deletes messages + entities)
    await deleteThread(supabase, threadId).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Memory cleared for thread "${threadId}"`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to clear memory";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
