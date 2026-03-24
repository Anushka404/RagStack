import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  documentDbId?: string
) {
  // Upsert: create if not exists, update timestamp if exists
  const { data, error } = await supabase
    .from("threads")
    .upsert(
      {
        id: threadId,
        user_id: userId,
        document_id: documentDbId || null,
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
    .select("*, documents(file_name, chunk_count)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateThreadDocument(
  supabase: SupabaseClient,
  threadId: string,
  documentDbId: string
) {
  const { error } = await supabase
    .from("threads")
    .update({ document_id: documentDbId, updated_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) throw error;
}

export async function deleteThread(supabase: SupabaseClient, threadId: string) {
  const { error } = await supabase.from("threads").delete().eq("id", threadId);
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

export async function getThreadEntities(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from("thread_entities")
    .select("entity")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).map((e) => e.entity);
}
