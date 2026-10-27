import { SupabaseClient } from "@supabase/supabase-js";
import { SourceRef } from "@/types/chat";
import { RetrievalTrace } from "@/types/rag";

export async function saveMessage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  sources?: SourceRef[],
  trace?: RetrievalTrace
) {
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    user_id: userId,
    role,
    content,
    sources: sources && sources.length > 0 ? JSON.stringify(sources) : null,
    trace: trace ?? null,
  });
  if (error) throw error;
}

/** Questions the user asked in the last minute, across all threads (for rate limiting). */
export async function countRecentQuestions(supabase: SupabaseClient, userId: string) {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function getThreadMessages(supabase: SupabaseClient, userId: string, threadId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, sources, trace")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}
