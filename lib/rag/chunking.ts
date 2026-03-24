import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { cleanPDFText } from "@/lib/pdf/parse";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
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
