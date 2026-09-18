import { SupabaseClient } from "@supabase/supabase-js";
import { DocumentRow } from "@/types/documents";

const DOCUMENT_COLUMNS =
  "id, document_id, file_name, chunk_count, status, processed_chunks, error, storage_path, file_size_bytes, created_at";

export async function createPendingDocument(
  supabase: SupabaseClient,
  userId: string,
  data: { id: string; fileName: string; fileSizeBytes: number; storagePath: string }
): Promise<DocumentRow> {
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      id: data.id,
      user_id: userId,
      // New uploads use the row id as the Pinecone documentId, so vectors map 1:1 to rows.
      document_id: data.id,
      file_name: data.fileName,
      file_size_bytes: data.fileSizeBytes,
      storage_path: data.storagePath,
      status: "uploading",
    })
    .select(DOCUMENT_COLUMNS)
    .single();

  if (error) throw error;
  return doc as DocumentRow;
}

export async function getDocument(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as DocumentRow | null;
}

export async function listUserDocuments(
  supabase: SupabaseClient,
  userId: string
): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

export async function updateDocument(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: Partial<Pick<DocumentRow, "status" | "error" | "chunk_count" | "processed_chunks">>
): Promise<DocumentRow> {
  const { data, error } = await supabase
    .from("documents")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", id)
    .select(DOCUMENT_COLUMNS)
    .single();

  if (error) throw error;
  return data as DocumentRow;
}

export async function deleteDocumentRow(supabase: SupabaseClient, userId: string, id: string) {
  const { error } = await supabase.from("documents").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function countUserDocuments(supabase: SupabaseClient, userId: string) {
  const { count, error } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}
