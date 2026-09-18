import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  documentDbId?: string
) {
  // Upsert: create if not exists, update timestamp if exists. document_id is only
  // written when given, so later calls don't clear an existing document link.
  const { data, error } = await supabase
    .from("threads")
    .upsert(
      {
        id: threadId,
        user_id: userId,
        ...(documentDbId ? { document_id: documentDbId } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserThreads(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("threads")
    .select("id, updated_at, documents(id, file_name, chunk_count)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
}

export async function updateThreadDocument(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  documentDbId: string
) {
  const { error } = await supabase
    .from("threads")
    .update({ document_id: documentDbId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", threadId);

  if (error) throw error;
}

export async function deleteThread(supabase: SupabaseClient, userId: string, threadId: string) {
  const { error } = await supabase.from("threads").delete().eq("user_id", userId).eq("id", threadId);
  if (error) throw error;
}

export async function saveEntity(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  entity: string
) {
  const { error } = await supabase.from("thread_entities").insert({
    thread_id: threadId,
    user_id: userId,
    entity,
  });
  if (error) throw error;
}

export async function getThreadEntities(supabase: SupabaseClient, userId: string, threadId: string) {
  const { data, error } = await supabase
    .from("thread_entities")
    .select("entity")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).map((e) => e.entity);
}
