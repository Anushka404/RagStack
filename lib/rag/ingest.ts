import { SupabaseClient } from "@supabase/supabase-js";
import { Document } from "@langchain/core/documents";
import { loadDocument } from "@/lib/pdf/loader";
import { cleanPDFText, removeRepeatedLines } from "@/lib/pdf/parse";
import { openPdf, pageImageJpeg } from "@/lib/pdf/pdfjs";
import { ocrPageImage } from "@/lib/pdf/ocr";
import { chunkDocuments, CHUNK_OVERLAP, CHUNK_SIZE } from "./chunking";
import { attachMetadata } from "./metadata";
import { upsertChunks, invalidateIndexStats } from "@/lib/pinecone/vector-store";
import { getDocument, getOcrCache, saveOcrCache, updateDocument } from "@/lib/db/documents";
import { upsertChunkRows } from "@/lib/db/chunks";
import { embeddingModelName } from "@/lib/ai/embeddings";
import { ocrModelName } from "@/lib/ai/model";
import { DocumentRow, DocumentStats, DOCUMENTS_BUCKET, fileExtension } from "@/types/documents";

/** Chunks embedded per Pinecone upsert. */
const BATCH_SIZE = 96;
/** Stop starting new batches after this long, leaving headroom under maxDuration (60s). */
const TIME_BUDGET_MS = 40_000;

/** PDF pages with less text than this are treated as scans and sent to OCR. */
const MIN_PAGE_TEXT = 20;
/** Pages read in parallel; free vision models are rate-limited, so keep it small. */
const OCR_CONCURRENCY = 3;
/** Start another OCR batch only this early in a step: a batch can take up to the 40 s OCR timeout. */
const OCR_START_WINDOW_MS = 10_000;
/** A page failing this many times fails the document; Retry resumes with fresh attempts. */
const OCR_MAX_ATTEMPTS = 3;

const pageNumber = (p: Document) => p.metadata.loc.pageNumber as number;

/**
 * OCR for scanned PDF pages, spread across steps: reads as many image-only pages as
 * fit in this step and caches each page's text on the row, so a later step (or a
 * Retry) never reads a page twice. Fills in the page text once every scan is read.
 */
async function ocrScannedPages(
  supabase: SupabaseClient,
  userId: string,
  doc: DocumentRow,
  blob: Blob,
  pageDocs: Document[],
  startedAt: number
): Promise<DocumentStats["ocr"]> {
  const scanned = pageDocs.filter((p) => cleanPDFText(p.pageContent).length < MIN_PAGE_TEXT);
  if (!scanned.length) return undefined;

  const cache = await getOcrCache(supabase, userId, doc.id);
  const isRead = (p: Document) => String(pageNumber(p)) in cache.pages;
  const failedNow = new Set<number>();
  let missing = scanned.filter((p) => !isRead(p));

  if (missing.length) {
    const pdf = await openPdf(await blob.arrayBuffer());
    try {
      while (missing.length && Date.now() - startedAt < OCR_START_WINDOW_MS) {
        const batch = missing.slice(0, OCR_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (p) => {
            const jpeg = await pageImageJpeg(await pdf.getPage(pageNumber(p)));
            return jpeg ? ocrPageImage(jpeg) : null; // no image on the page: nothing to read
          })
        );
        let failure: string | null = null;
        let quotaUsedUp = false;
        results.forEach((r, i) => {
          const n = String(pageNumber(batch[i]));
          if (r.status === "fulfilled") {
            cache.pages[n] = r.value?.text ?? "";
            if (r.value) cache.model = r.value.model;
            return;
          }
          const reason = r.reason instanceof Error ? r.reason.message : "unknown error";
          failedNow.add(pageNumber(batch[i]));
          // A spent daily quota isn't the page's fault, and retrying today can't help.
          if (/free-models-per-day/i.test(reason)) { quotaUsedUp = true; return; }
          cache.attempts[n] = (cache.attempts[n] ?? 0) + 1;
          if (cache.attempts[n] >= OCR_MAX_ATTEMPTS) {
            cache.attempts[n] = 0;
            failure = `OCR failed on page ${n}: ${reason}`;
          }
        });
        await saveOcrCache(supabase, userId, doc.id, cache);
        if (quotaUsedUp) {
          const done = Object.keys(cache.pages).length;
          throw new Error(
            `OpenRouter's free daily limit is used up (it resets at 00:00 UTC). Press Retry after that: the ${done} pages already read are kept.`
          );
        }
        if (failure) throw new Error(failure);
        // A page that just failed waits for the next step instead of being retried at once.
        missing = scanned.filter((p) => !isRead(p) && !failedNow.has(pageNumber(p)));
      }
    } finally {
      await pdf.destroy();
    }
  }

  const ocr = { pages: scanned.length, done: scanned.filter(isRead).length, model: cache.model ?? ocrModelName };
  if (ocr.done === ocr.pages) scanned.forEach((p) => (p.pageContent = cache.pages[String(pageNumber(p))]));
  return ocr;
}

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

    const pageDocs = await loadDocument(blob, doc.file_name);
    if (!pageDocs.length) throw new Error("No content could be extracted from the file.");

    // Scanned pages have no text layer: OCR them first, over as many steps as it takes.
    const ocr = fileExtension(doc.file_name) === "pdf"
      ? await ocrScannedPages(supabase, userId, doc, blob, pageDocs, startedAt)
      : undefined;
    if (ocr && ocr.done < ocr.pages) {
      return updateDocument(supabase, userId, id, { status: "parsing", stats: { ...doc.stats, ocr } });
    }

    // Running headers/footers repeat on every page and would pollute every chunk.
    const { pages, removed } = removeRepeatedLines(pageDocs.map((p) => p.pageContent));
    pages.forEach((text, i) => (pageDocs[i].pageContent = text));

    const chunks = await chunkDocuments(pageDocs);
    if (!chunks.length) {
      throw new Error(ocr ? "No readable text found, even after OCR of the scanned pages." : "No text found in the file.");
    }

    const enriched = attachMetadata(chunks, {
      documentId: doc.document_id,
      fileName: doc.file_name,
      uploadedAt: doc.created_at,
      userId,
      collection: doc.collection,
      year: doc.year,
      tags: doc.tags,
    });

    if (doc.status !== "embedding" || doc.chunk_count !== enriched.length) {
      doc = await updateDocument(supabase, userId, id, {
        status: "embedding",
        chunk_count: enriched.length,
        stats: {
          pages: pageDocs.length,
          characters: enriched.reduce((n, c) => n + c.pageContent.length, 0),
          removedLines: removed,
          embeddingModel: embeddingModelName,
          chunkSize: CHUNK_SIZE,
          chunkOverlap: CHUNK_OVERLAP,
          ...(ocr ? { ocr } : {}),
        },
      });
    }

    let done = Math.min(doc.processed_chunks, enriched.length);
    while (done < enriched.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const batch = enriched.slice(done, done + BATCH_SIZE);
      await Promise.all([upsertChunks(batch, userId), upsertChunkRows(supabase, userId, doc.id, batch)]);
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
