import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { getUserThreads } from "@/lib/db/threads";
import { getThreadMessages } from "@/lib/db/messages";
import { listUserDocuments } from "@/lib/db/documents";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threadId = req.nextUrl.searchParams.get("threadId");

    // If threadId specified, return messages for that thread
    if (threadId) {
      const messages = await getThreadMessages(supabase, user.id, threadId);
      return NextResponse.json({ messages });
    }

    // Otherwise return user's threads plus the latest thread's messages,
    // so the first page load needs only one request.
    const [threads, documents] = await Promise.all([
      getUserThreads(supabase, user.id),
      listUserDocuments(supabase, user.id),
    ]);
    const latestMessages = threads.length > 0
      ? await getThreadMessages(supabase, user.id, threads[0].id)
      : [];

    return NextResponse.json({ email: user.email, threads, latestMessages, documents });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to load data";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
