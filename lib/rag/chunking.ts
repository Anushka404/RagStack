import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { cleanPDFText } from "@/lib/pdf/parse";

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

/**
 * Splits page-level Documents into smaller chunks.
 * Processes page by page to preserve page number associations.
 * Filters empty/noisy chunks.
 */
export async function chunkDocuments(pageDocs: Document[]): Promise<Document[]> {
  const allChunks: Document[] = [];

  for (const pageDoc of pageDocs) {
    const cleanedText = cleanPDFText(pageDoc.pageContent);
    if (!cleanedText || cleanedText.length < 20) continue;

    const pageChunks = await splitter.createDocuments(
      [cleanedText],
      [pageDoc.metadata] // pass page metadata through
    );

    // Filter out any still-empty chunks
    const validChunks = pageChunks.filter(
      (c) => c.pageContent.trim().length >= 20
    );
    allChunks.push(...validChunks);
  }

  return allChunks;
}
