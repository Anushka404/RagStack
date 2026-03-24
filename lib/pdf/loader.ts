import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from "@langchain/core/documents";

/**
 * Loads a PDF from a file path and returns LangChain Documents.
 * Each document corresponds to one page, with metadata.loc.pageNumber set.
 */
export async function loadPDF(filePath: string): Promise<Document[]> {
  const loader = new PDFLoader(filePath, { splitPages: true });
  const docs = await loader.load();
  return docs;
}
