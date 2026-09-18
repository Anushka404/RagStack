import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { isGemini } from "./model";

/**
 * The same model MUST be used for ingestion and retrieval, and the Pinecone index
 * dimension must match it: gemini-embedding-001 = 3072, text-embedding-3-small = 1536.
 * Switching provider means creating a new Pinecone index.
 */
export const embeddings = isGemini
  ? new GoogleGenerativeAIEmbeddings({
      model: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
      apiKey: process.env.GOOGLE_API_KEY,
    })
  : new OpenAIEmbeddings({
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
