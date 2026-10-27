import { HumanMessage } from "@langchain/core/messages";
import { ocrModel, ocrModelName } from "@/lib/ai/model";

/**
 * Per-page limit. Vercel Hobby stops a request at 60 s, so there a page gets 40 s; running
 * locally (e.g. a demo) slow pages get longer. Free vision models took 7–26 s per handwritten
 * page in testing with 3 pages in parallel, and some pages took over 40 s at busy times.
 */
const OCR_TIMEOUT_MS = process.env.VERCEL ? 40_000 : 90_000;

const OCR_PROMPT = `Transcribe all text in this scanned page exactly as written, including handwriting.
Keep the reading order, headings, list markers and line breaks. Write code, formulas and symbols exactly.
If there is a diagram, flowchart or table, transcribe its text and add a one-line description in [square brackets].
Output only the transcription, with no comments. If the page has no text, output nothing.`;

/**
 * OCR with a vision LLM: free through OpenRouter, and unlike Tesseract it reads
 * handwritten notes (Tesseract scored 30/100 confidence and garbled cursive in testing).
 * Returns the page text and the model that read it.
 */
export async function ocrPageImage(jpeg: Buffer): Promise<{ text: string; model: string }> {
  const res = await ocrModel
    .invoke(
      [new HumanMessage({
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
        ],
      })],
      { timeout: OCR_TIMEOUT_MS }
    )
    .catch((err: unknown) => {
      // The timeout surfaces as a bare "The user aborted a request."
      if (err instanceof Error && /abort/i.test(err.message)) {
        throw new Error(`the vision model didn't answer within ${OCR_TIMEOUT_MS / 1000} s`);
      }
      throw err;
    });
  const raw = typeof res.content === "string" ? res.content : "";
  const served = res.response_metadata?.model_name;
  return {
    // Some models wrap the transcription in a code fence despite the prompt.
    text: raw.replace(/^```[a-z]*\n?|\n?```$/g, "").trim(),
    model: typeof served === "string" && served ? served : ocrModelName,
  };
}
