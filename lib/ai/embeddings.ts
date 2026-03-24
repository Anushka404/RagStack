import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Centralized embedding model.
 * Uses text-embedding-3-small — better quality and cheaper than ada-002.
 * IMPORTANT: The same model instance MUST be used for both ingestion and retrieval.
 */
export const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  dimensions: 1536,
  openAIApiKey: process.env.OPENAI_API_KEY!,
});
