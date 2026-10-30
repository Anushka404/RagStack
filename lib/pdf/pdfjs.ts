import type { PdfImage, PdfPage } from "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js";

/** Longest side of a page image sent to OCR: enough for handwriting, small enough to upload fast. */
const OCR_IMAGE_MAX_PX = 1600;

/** The pdf.js build bundled in pdf-parse (the same one LangChain's PDFLoader uses). */
async function loadPdfjs() {
  const { default: pdfjs } = await import("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
  pdfjs.disableWorker = true;
  // Reading a page's images also loads its fonts, which pdf.js would install through the
  // browser's `document`; on the server that throws inside a callback and kills the process.
  // This build reads settings from a global PDFJS object, not from the module export.
  const settings = (globalThis as { PDFJS?: { disableFontFace?: boolean } }).PDFJS;
  if (settings) settings.disableFontFace = true;
  return pdfjs;
}

/** Opens a PDF; JPEGs are decoded in JS so page images work without a browser or canvas. */
export async function openPdf(data: ArrayBuffer) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(data), nativeImageDecoderSupport: "none" }).promise;
}

/** Page text with a newline wherever the baseline changes (as LangChain's PDFLoader does). */
export async function pageText(page: PdfPage): Promise<string> {
  const { items } = await page.getTextContent();
  let lastY: number | undefined;
  return items
    .map((item) => {
      const sameLine = lastY === undefined || lastY === item.transform[5];
      lastY = item.transform[5];
      return sameLine ? item.str : `\n${item.str}`;
    })
    .join("");
}

/**
 * The page's largest painted image (the scan, on scanned pages) as a JPEG, or null.
 * ponytail: takes one image per page; scanners that tile a page into strips would need compositing.
 */
export async function pageImageJpeg(page: PdfPage): Promise<Buffer | null> {
  const { OPS } = await loadPdfjs();
  const ops = await page.getOperatorList();
  const names = ops.fnArray.flatMap((fn, i) =>
    fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject ? [ops.argsArray[i][0] as string] : []
  );
  let best: PdfImage | null = null;
  for (const name of names) {
    const img = await new Promise<PdfImage | null>((resolve) => page.objs.get(name, resolve));
    if (img?.data && (!best || img.width * img.height > best.width * best.height)) best = img;
  }
  if (!best) return null;

  let pixels = Buffer.from(best.data.buffer, best.data.byteOffset, best.data.byteLength);
  let channels: 1 | 3 | 4 = best.kind === 3 ? 4 : best.kind === 2 ? 3 : 1;
  if (best.kind === 1) {
    // 1 bit per pixel, rows padded to whole bytes: expand to 8-bit gray.
    const rowBytes = (best.width + 7) >> 3;
    const gray = Buffer.alloc(best.width * best.height);
    for (let y = 0; y < best.height; y++) {
      for (let x = 0; x < best.width; x++) {
        gray[y * best.width + x] = (pixels[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
      }
    }
    pixels = gray;
    channels = 1;
  }
  const { default: sharp } = await import("sharp");
  return sharp(pixels, { raw: { width: best.width, height: best.height, channels } })
    .resize({ width: OCR_IMAGE_MAX_PX, height: OCR_IMAGE_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}
