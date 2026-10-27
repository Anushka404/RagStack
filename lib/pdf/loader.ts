import { Document } from "@langchain/core/documents";
import { fileExtension } from "@/types/documents";
import { parseCsv } from "./parse";
import { openPdf, pageText } from "./pdfjs";

/** CSV rows per pseudo-page, so the tree and citations can point at a block of rows. */
const CSV_ROWS_PER_PAGE = 50;

const page = (text: string, pageNumber: number) => new Document({ pageContent: text, metadata: { loc: { pageNumber } } });

/**
 * Loads an uploaded file into page Documents (metadata.loc.pageNumber set).
 * PDFs keep every real page, including image-only ones with empty text (ingestion
 * OCRs those); DOCX/TXT/Markdown are one page; CSV rows become "column: value"
 * lines grouped into pages of 50 rows.
 */
export async function loadDocument(blob: Blob, fileName: string): Promise<Document[]> {
  const ext = fileExtension(fileName);
  if (ext === "pdf") {
    const pdf = await openPdf(await blob.arrayBuffer());
    try {
      const pages: Document[] = [];
      for (let n = 1; n <= pdf.numPages; n++) pages.push(page(await pageText(await pdf.getPage(n)), n));
      return pages;
    } finally {
      await pdf.destroy();
    }
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await blob.arrayBuffer()) });
    return [page(value, 1)];
  }
  const text = await blob.text();
  if (ext === "csv") {
    const [header, ...rows] = parseCsv(text);
    if (!header) return [];
    const lines = rows.map((r) => header.map((h, i) => `${h}: ${r[i] ?? ""}`).join("; "));
    const pages: Document[] = [];
    for (let i = 0; i < lines.length; i += CSV_ROWS_PER_PAGE) {
      pages.push(page(lines.slice(i, i + CSV_ROWS_PER_PAGE).join("\n"), pages.length + 1));
    }
    return pages;
  }
  return [page(text, 1)];
}
