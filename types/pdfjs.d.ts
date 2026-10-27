// The pdf.js 1.10 build bundled inside pdf-parse (runs in Node without a canvas).
declare module "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js" {
  export interface TextItem { str: string; transform: number[] }
  /** Decoded image: kind 1 = 1-bit gray, 2 = RGB, 3 = RGBA. */
  export interface PdfImage { width: number; height: number; kind: number; data: Uint8Array | Uint8ClampedArray }
  export interface PdfPage {
    getTextContent(): Promise<{ items: TextItem[] }>;
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get(name: string, callback: (img: PdfImage) => void): void };
  }
  export interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
  const pdfjs: {
    disableWorker: boolean;
    OPS: Record<string, number>;
    getDocument(src: { data: Uint8Array; nativeImageDecoderSupport?: "none" | "decode" | "display" }): { promise: Promise<PdfDocument> };
  };
  export default pdfjs;
}
