import { SupabaseClient } from "@supabase/supabase-js";
import { loadPDF } from "@/lib/pdf/loader";
import { chunkDocuments } from "./chunking";
import { attachMetadata } from "./metadata";
import { upsertChunks, invalidateIndexStats } from "@/lib/pinecone/vector-store";
import { getDocument, updateDocument } from "@/lib/db/documents";
import { DocumentRow, DOCUMENTS_BUCKET } from "@/types/documents";

/** Chunks embedded per Pinecone upsert. */
const BATCH_SIZE = 96;
/** Stop starting new batches after this long, leaving headroom under maxDuration (60s). */
const TIME_BUDGET_MS = 40_000;

/**
 * Advances ingestion of one uploaded PDF as far as the time budget allows and
 * returns the updated row. The client calls this repeatedly until the status is
 * "ready" or "failed", so a large PDF is spread across many short requests.
 *
 * Each step re-parses the PDF (chunking is deterministic) and resumes embedding
 * at processed_chunks; vector ids are deterministic, so a repeated batch is harmless.
 */
export async function processDocumentStep(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  { retry = false }: { retry?: boolean } = {}
): Promise<DocumentRow | null> {
  const startedAt = Date.now();
  let doc = await getDocument(supabase, userId, id);
  if (doc?.status === "failed" && retry) {
    // Resume from processed_chunks rather than starting over.
    doc = await updateDocument(supabase, userId, id, { status: "parsing", error: null });
  }
  if (!doc || doc.status === "ready" || doc.status === "failed") return doc;

  try {
    if (!doc.storage_path) throw new Error("Document has no stored file.");

    const { data: blob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(doc.storage_path);
    if (downloadError || !blob) throw new Error("Uploaded file not found. Please upload it again.");

    if (doc.status === "uploading") {
      doc = await updateDocument(supabase, userId, id, { status: "parsing" });
    }

    const pageDocs = await loadPDF(blob);
    if (!pageDocs.length) throw new Error("No pages extracted from PDF.");

    const chunks = await chunkDocuments(pageDocs);
    if (!chunks.length) throw new Error("No text found in PDF. Scanned PDFs are not supported yet.");

    const enriched = attachMetadata(chunks, {
      documentId: doc.document_id,
      fileName: doc.file_name,
      uploadedAt: doc.created_at,
      userId,
    });

    if (doc.status !== "embedding" || doc.chunk_count !== enriched.length) {
      doc = await updateDocument(supabase, userId, id, {
        status: "embedding",
        chunk_count: enriched.length,
      });
    }

    let done = Math.min(doc.processed_chunks, enriched.length);
    while (done < enriched.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const batch = enriched.slice(done, done + BATCH_SIZE);
      await upsertChunks(batch, userId);
      done += batch.length;
      doc = await updateDocument(supabase, userId, id, { processed_chunks: done });
    }

    if (done >= enriched.length) {
      doc = await updateDocument(supabase, userId, id, { status: "ready", error: null });
      invalidateIndexStats();
    }
    return doc;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed.";
    console.error(`Ingestion failed for document ${id}:`, err);
    return updateDocument(supabase, userId, id, { status: "failed", error: message });
  }
}
