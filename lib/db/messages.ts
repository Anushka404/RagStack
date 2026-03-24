import { SupabaseClient } from "@supabase/supabase-js";
import { SourceRef } from "@/types/chat";

export async function saveMessage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  sources?: SourceRef[]
) {
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    user_id: userId,
    role,
    content,
    sources: sources && sources.length > 0 ? JSON.stringify(sources) : null,
  });
  if (error) throw error;
}

export async function getThreadMessages(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function deleteThreadMessages(supabase: SupabaseClient, threadId: string) {
  const { error } = await supabase.from("messages").delete().eq("thread_id", threadId);
  if (error) throw error;
}
