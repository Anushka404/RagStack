import { SupabaseClient } from "@supabase/supabase-js";

export async function saveDocument(
  supabase: SupabaseClient,
  userId: string,
  data: { documentId: string; fileName: string; chunkCount: number }
) {
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      document_id: data.documentId,
      file_name: data.fileName,
      chunk_count: data.chunkCount,
    })
    .select()
    .single();

  if (error) throw error;
  return doc;
}

export async function getUserDocuments(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getDocumentById(supabase: SupabaseClient, docId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", docId)
    .single();

  if (error) throw error;
  return data;
}
