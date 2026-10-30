import { HumanMessage } from "@langchain/core/messages";
import { ocrHasFallback, ocrModel, ocrModelName, ocrRetryModel } from "@/lib/ai/model";
import { collapseRepeats } from "./parse";

/**
 * Per-page limit, keeping a step under Vercel Hobby's 60 s. With thinking off a page takes
 * 2–9 s; a call still running at 40 s is stuck in the free pool, and its retry goes to the
 * paid fallback model instead.
 */
const OCR_TIMEOUT_MS = 40_000;

const OCR_PROMPT = `Transcribe all text in this scanned page exactly as written, including handwriting.
Keep the reading order, headings, list markers and line breaks. Write code, formulas and symbols exactly.
If there is a diagram, flowchart or table, transcribe its text and add a one-line description in [square brackets].
Leave out pre-printed page furniture: DATE and PAGE boxes, page numbers, and notebook or form branding.
Output only the transcription, with no comments. If the page has no text, output nothing.`;

/**
 * OCR with a vision LLM: free through OpenRouter, and unlike Tesseract it reads
 * handwritten notes (Tesseract scored 30/100 confidence and garbled cursive in testing).
 * A read that loops (free Nemotron did on a page of dashed XML; the paid models didn't)
 * is redone on the fallback model, so the rest of the page isn't lost.
 * Returns the page text and the model that read it.
 */
export async function ocrPageImage(jpeg: Buffer, { retry = false } = {}): Promise<{ text: string; model: string }> {
  const first = await readPage(retry ? ocrRetryModel : ocrModel, jpeg);
  if (first.looped && !retry && ocrHasFallback) return readPage(ocrRetryModel, jpeg);
  return first;
}

async function readPage(model: typeof ocrModel, jpeg: Buffer) {
  const res = await model
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
  // Some models wrap the transcription in a code fence despite the prompt.
  const raw = (typeof res.content === "string" ? res.content : "").replace(/^```[a-z]*\n?|\n?```$/g, "");
  const text = collapseRepeats(raw);
  const served = res.response_metadata?.model_name;
  return {
    text: text.trim(),
    model: typeof served === "string" && served ? served : ocrModelName,
    looped: text !== raw || res.response_metadata?.finish_reason === "length",
  };
}
