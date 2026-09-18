import { SupabaseClient } from "@supabase/supabase-js";
import { Thread, ThreadMessage } from "@/types/memory";

const MAX_MESSAGES = 10;
const MAX_ENTITIES = 5;

/**
 * Rebuilds a thread's conversational memory from Supabase. Serverless instances
 * don't share process memory, so the database is the only reliable source.
 * Messages and entities come back oldest → newest.
 */
export async function loadThreadMemory(
  supabase: SupabaseClient,
  userId: string,
  threadId: string
): Promise<Thread> {
  const [messagesRes, entitiesRes] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES),
    supabase
      .from("thread_entities")
      .select("entity")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTITIES),
  ]);
  if (messagesRes.error) throw messagesRes.error;
  if (entitiesRes.error) throw entitiesRes.error;

  const messages: ThreadMessage[] = (messagesRes.data ?? []).reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.created_at).getTime(),
  }));
  const entities = [...new Set((entitiesRes.data ?? []).reverse().map((e) => e.entity))];

  return { threadId, messages, entities };
}
