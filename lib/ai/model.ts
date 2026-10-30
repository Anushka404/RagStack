import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * LLM_PROVIDER:
 *  - "openrouter": a free model with a cheap paid fallback, key from openrouter.ai/keys
 *  - "gemini": free Gemini API tier
 *  - anything else: OpenAI (paid API credits)
 */
export const llmProvider = process.env.LLM_PROVIDER || "openai";

// OpenRouter takes a comma-separated fallback list (max 3) and moves to the next model when
// one is busy. Free Nemotron VL goes first: with thinking off it read handwritten notes in
// ~2 s at the accuracy of paid models (bake-off, 2026-10-30). Qwen 3.7 Flash catches what
// the shared free pool drops (busy, or the 20-requests-a-minute free limit) at ~$0.0001 a
// call. Both read images, so one list serves chat, checks and OCR. Model ids get retired:
// check https://openrouter.ai/models before changing them.
const OPENROUTER_DEFAULT = "nvidia/nemotron-3.5-super-vl:free,qwen/qwen3.7-flash";

// LangChain retries 429s 6 times with backoff (~1 min), so a spent daily quota would hang
// past maxDuration instead of reaching the user as an error.
const DEFAULT_MAX_RETRIES = 2;

const DEFAULT_MODELS: Record<string, { chat: string; utility: string; ocr: string }> = {
  openrouter: { chat: OPENROUTER_DEFAULT, utility: OPENROUTER_DEFAULT, ocr: OPENROUTER_DEFAULT },
  gemini: { chat: "gemini-2.5-flash", utility: "gemini-2.5-flash-lite", ocr: "gemini-2.5-flash" },
  openai: { chat: "gpt-4o-mini", utility: "gpt-4o-mini", ocr: "gpt-4o-mini" },
};
const defaults = DEFAULT_MODELS[llmProvider] ?? DEFAULT_MODELS.openai;

function makeModel(model: string, temperature: number, maxRetries = DEFAULT_MAX_RETRIES, maxTokens?: number) {
  if (llmProvider === "gemini") {
    return new ChatGoogleGenerativeAI({ model, temperature, maxRetries, maxOutputTokens: maxTokens, apiKey: process.env.GOOGLE_API_KEY });
  }
  if (llmProvider === "openrouter") {
    const models = model.split(",").map((m) => m.trim()).filter(Boolean);
    if (models.length > 3) throw new Error("OpenRouter accepts at most 3 fallback models.");

    // OpenRouter speaks the OpenAI API, so the OpenAI client works with a different base URL.
    return new ChatOpenAI({
      model: models[0],
      temperature,
      maxRetries,
      maxTokens,
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      // Thinking off: Nemotron otherwise spends ~5,000 hidden tokens per page before answering
      // (57 s for one OCR page in testing, vs 2.4 s off), and on paid models it is billed output.
      modelKwargs: { models, reasoning: { enabled: false } },
    });
  }
  return new ChatOpenAI({ model, temperature, maxRetries, maxTokens, openAIApiKey: process.env.OPENAI_API_KEY });
}

/**
 * Output cap for one OCR page: ~4x a dense handwritten page. Models can loop on rows of
 * dashes (page 46 of the Cloud Computing notes repeated "- " until cut off), and without a
 * cap that call ran past 90 s; with it, it ends in ~17 s and keeps the text before the loop.
 */
const OCR_MAX_TOKENS = 2048;

/** Final answer generation. */
export const chatModel = makeModel(process.env.CHAT_MODEL || defaults.chat, 0.4);
/** Configured primary chat model, used when the provider doesn't report which one answered. */
export const chatModelName = (process.env.CHAT_MODEL || defaults.chat).split(",")[0].trim();

/** Query rewriting and entity extraction. */
export const utilityModel = makeModel(process.env.UTILITY_MODEL || defaults.utility, 0.2);

/**
 * Vision model that transcribes scanned pages (one call per page). No in-call retries:
 * a failed page is retried by the next ingestion step, which keeps each step under 60 s.
 */
const ocrModels = process.env.OCR_MODEL || defaults.ocr;
export const ocrModel = makeModel(ocrModels, 0, 0, OCR_MAX_TOKENS);
export const ocrModelName = ocrModels.split(",")[0].trim();
/**
 * For a page whose first read failed: skip straight to the fallback. OpenRouter only falls
 * back when a model errors, not when the free pool leaves a call hanging until our timeout.
 */
export const ocrRetryModel = makeModel(ocrModels.split(",").slice(1).join(",") || ocrModels, 0, 0, OCR_MAX_TOKENS);
/** Whether ocrRetryModel is a different model (a list with a fallback), not the same one again. */
export const ocrHasFallback = ocrModels.includes(",");
