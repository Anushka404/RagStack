import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * LLM_PROVIDER=gemini uses the free Gemini API tier; anything else uses OpenAI (paid API credits).
 */
export const isGemini = process.env.LLM_PROVIDER === "gemini";

function makeModel(model: string, temperature: number) {
  return isGemini
    ? new ChatGoogleGenerativeAI({ model, temperature, apiKey: process.env.GOOGLE_API_KEY })
    : new ChatOpenAI({ model, temperature, openAIApiKey: process.env.OPENAI_API_KEY });
}

/** Final answer generation. */
export const chatModel = makeModel(
  process.env.CHAT_MODEL || (isGemini ? "gemini-2.5-flash" : "gpt-4o-mini"),
  0.4
);

/** Query rewriting and entity extraction. */
export const utilityModel = makeModel(
  process.env.UTILITY_MODEL || (isGemini ? "gemini-2.5-flash-lite" : "gpt-4o-mini"),
  0.2
);
