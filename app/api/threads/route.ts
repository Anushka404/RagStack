import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserDocuments } from "@/lib/db/documents";
import { getUserThreads } from "@/lib/db/threads";
import { getThreadMessages } from "@/lib/db/messages";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threadId = req.nextUrl.searchParams.get("threadId");

    // If threadId specified, return messages for that thread
    if (threadId) {
      const messages = await getThreadMessages(supabase, threadId);
      return NextResponse.json({ messages });
    }

    // Otherwise return user's threads and documents
    const [threads, documents] = await Promise.all([
      getUserThreads(supabase, user.id),
      getUserDocuments(supabase, user.id),
    ]);

    return NextResponse.json({ threads, documents });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to load data";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
