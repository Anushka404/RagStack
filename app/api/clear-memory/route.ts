import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { deleteThread } from "@/lib/db/threads";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const threadId = (body.threadId as string) || "anonymous";

    // Memory lives in the DB, so deleting the thread clears it (cascades to messages + entities)
    await deleteThread(supabase, user.id, threadId).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Memory cleared for thread "${threadId}"`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to clear memory";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
