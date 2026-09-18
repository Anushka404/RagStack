import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from "@langchain/core/documents";

/**
 * Loads a PDF (file path or in-memory Blob) and returns LangChain Documents.
 * Each document corresponds to one page, with metadata.loc.pageNumber set.
 */
export async function loadPDF(source: string | Blob): Promise<Document[]> {
  const loader = new PDFLoader(source, { splitPages: true });
  const docs = await loader.load();
  return docs;
}
