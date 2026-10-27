import { SupabaseClient } from "@supabase/supabase-js";
import { Document } from "@langchain/core/documents";
import { ChunkMetadata, RetrievalFilters, RetrievedDoc } from "@/types/rag";
import { ChunkRow } from "@/types/documents";
import { chunkVectorId } from "@/lib/pinecone/vector-store";

/**
 * Stores chunk text next to its Pinecone vector (same id), for the knowledge-base
 * tree and keyword search. Upsert, so a re-run batch overwrites.
 */
export async function upsertChunkRows(
  supabase: SupabaseClient,
  userId: string,
  documentRowId: string,
  docs: Document<ChunkMetadata>[]
) {
  if (docs.length === 0) return;
  const { error } = await supabase.from("chunks").upsert(
    docs.map((d) => ({
      id: chunkVectorId(d.metadata.documentId, d.metadata.chunkIndex),
      user_id: userId,
      document_id: documentRowId,
      chunk_index: d.metadata.chunkIndex,
      page_number: d.metadata.pageNumber,
      content: d.pageContent,
    })),
    { onConflict: "id" }
  );
  if (error) throw error;
}

/**
 * Keyword search: Postgres full-text matches over the user's stored chunks
 * (search_chunks_keyword in migration 004), restricted by the same filters as Pinecone.
 */
export async function searchChunksKeyword(
  supabase: SupabaseClient,
  query: string,
  filters: RetrievalFilters,
  k = 20
): Promise<RetrievedDoc[]> {
  const { data, error } = await supabase.rpc("search_chunks_keyword", {
    q: query,
    match_count: k,
    filter_collection: filters.collection ?? null,
    filter_years: filters.years?.length ? filters.years : null,
    filter_document_ids: filters.documentIds?.length ? filters.documentIds : null,
  });
  if (error) throw error;

  type Row = {
    id: string; chunk_index: number; page_number: number | null; content: string; rank: number;
    document_id: string; file_name: string; collection: string; year: number | null; tags: string[];
  };
  return ((data ?? []) as Row[]).map((r, i) => ({
    id: r.id,
    content: r.content,
    score: r.rank,
    signals: { keywordRank: i + 1, keywordScore: r.rank },
    metadata: {
      documentId: r.document_id,
      fileName: r.file_name,
      pageNumber: r.page_number,
      chunkIndex: r.chunk_index,
      totalChunks: 0,
      source: "pdf_upload",
      uploadedAt: "",
      textPreview: r.content.slice(0, 200),
      userId: "",
      collection: r.collection,
      year: r.year,
      tags: r.tags ?? [],
    },
  }));
}

export async function getDocumentChunks(
  supabase: SupabaseClient,
  userId: string,
  documentRowId: string
): Promise<ChunkRow[]> {
  const { data, error } = await supabase
    .from("chunks")
    .select("id, chunk_index, page_number, content")
    .eq("user_id", userId)
    .eq("document_id", documentRowId)
    .order("chunk_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChunkRow[];
}
