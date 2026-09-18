import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * LLM_PROVIDER:
 *  - "openrouter": OpenRouter's free models (":free" suffix), key from openrouter.ai/keys
 *  - "gemini": free Gemini API tier
 *  - anything else: OpenAI (paid API credits)
 */
export const llmProvider = process.env.LLM_PROVIDER || "openai";

// OpenRouter free models get rate-limited upstream at random, so it gets a comma-separated
// fallback list (max 3): OpenRouter tries the next one when a model is busy.
// "openrouter/free" is OpenRouter's router that picks any available free model.
const OPENROUTER_FREE =
  "deepseek/deepseek-v4-flash-0731:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/free";

const DEFAULT_MODELS: Record<string, { chat: string; utility: string }> = {
  openrouter: { chat: OPENROUTER_FREE, utility: OPENROUTER_FREE },
  gemini: { chat: "gemini-2.5-flash", utility: "gemini-2.5-flash-lite" },
  openai: { chat: "gpt-4o-mini", utility: "gpt-4o-mini" },
};
const defaults = DEFAULT_MODELS[llmProvider] ?? DEFAULT_MODELS.openai;

function makeModel(model: string, temperature: number) {
  if (llmProvider === "gemini") {
    return new ChatGoogleGenerativeAI({ model, temperature, apiKey: process.env.GOOGLE_API_KEY });
  }
  if (llmProvider === "openrouter") {
    const models = model.split(",").map((m) => m.trim()).filter(Boolean);
    if (models.length > 3) throw new Error("OpenRouter accepts at most 3 fallback models.");
    const paid = models.filter((m) => !m.endsWith(":free") && m !== "openrouter/free");
    if (paid.length) throw new Error(`Only free OpenRouter models are allowed, got: ${paid.join(", ")}`);

    // OpenRouter speaks the OpenAI API, so the OpenAI client works with a different base URL.
    return new ChatOpenAI({
      model: models[0],
      temperature,
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      modelKwargs: { models },
    });
  }
  return new ChatOpenAI({ model, temperature, openAIApiKey: process.env.OPENAI_API_KEY });
}

/** Final answer generation. */
export const chatModel = makeModel(process.env.CHAT_MODEL || defaults.chat, 0.4);

/** Query rewriting and entity extraction. */
export const utilityModel = makeModel(process.env.UTILITY_MODEL || defaults.utility, 0.2);
