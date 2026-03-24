import { ChatOpenAI } from "@langchain/openai";

/**
 * Centralized GPT-4o chat model for final answer generation.
 * Streaming is enabled by default on `.stream()` calls.
 */
export const chatModel = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.4,
  openAIApiKey: process.env.OPENAI_API_KEY!,
});

/**
 * Lightweight model for query rewriting and entity extraction.
 * Faster and cheaper than GPT-4o for utility tasks.
 */
export const utilityModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.2,
  openAIApiKey: process.env.OPENAI_API_KEY!,
});
