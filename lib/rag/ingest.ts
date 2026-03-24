import crypto from "crypto";
import path from "path";
import { loadPDF } from "@/lib/pdf/loader";
import { chunkDocuments } from "./chunking";
import { attachMetadata } from "./metadata";
import { ingestDocuments } from "@/lib/pinecone/vector-store";

export interface IngestResult {
  documentId: string;
  fileName: string;
  chunkCount: number;
  fileSizeBytes: number;
}

/**
 * Full ingestion pipeline — scoped to user via Pinecone namespace.
 */
export async function ingestPDF(
  filePath: string,
  originalFileName: string,
  userId: string
): Promise<IngestResult> {
  const { createHash } = crypto;
  const fs = await import("fs");
  const buffer = fs.readFileSync(filePath);
  const fileSizeBytes = buffer.length;
  const documentId = createHash("md5").update(buffer).digest("hex").slice(0, 12);

  const fileName = path.basename(originalFileName);
  const uploadedAt = new Date().toISOString();

  // 1. Load PDF pages
  const pageDocs = await loadPDF(filePath);
  if (!pageDocs.length) throw new Error("No pages extracted from PDF.");

  // 2. Chunk
  const chunks = await chunkDocuments(pageDocs);
  if (!chunks.length) throw new Error("No valid chunks produced from PDF.");

  // 3. Attach rich metadata (including userId)
  const enrichedChunks = attachMetadata(chunks, { documentId, fileName, uploadedAt, userId });

  // 4. Embed + upsert into user's Pinecone namespace
  await ingestDocuments(enrichedChunks, userId);

  return { documentId, fileName, chunkCount: enrichedChunks.length, fileSizeBytes };
}
