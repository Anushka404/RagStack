import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { getPineconeClient } from "@/lib/pinecone/client";
import { llmProvider } from "./model";

/**
 * Pinecone's hosted embedding models (free on the Starter plan, same API key as the index).
 * @langchain/pinecone ships a PineconeEmbeddings class, but its embedQuery permanently
 * switches inputType to "query", which corrupts later document embeddings.
 */
class PineconeInferenceEmbeddings extends Embeddings {
  constructor(private model: string) {
    super({});
  }

  embedDocuments(texts: string[]) {
    return this.embed(texts, "passage");
  }

  async embedQuery(text: string) {
    return (await this.embed([text], "query"))[0];
  }

  private async embed(texts: string[], inputType: "passage" | "query") {
    const out: number[][] = [];
    // llama-text-embed-v2 accepts at most 96 inputs per request.
    for (let i = 0; i < texts.length; i += 96) {
      const res = await this.caller.call(() =>
        getPineconeClient().inference.embed(this.model, texts.slice(i, i + 96), {
          inputType,
          truncate: "END",
        })
      );
      for (const e of res.data) {
        if (!("values" in e) || !e.values) throw new Error("Pinecone returned an empty embedding.");
        out.push(e.values);
      }
    }
    return out;
  }
}

/**
 * EMBEDDING_PROVIDER: "pinecone" | "gemini" | "openai" (defaults to pinecone for openrouter,
 * since OpenRouter's free chat keys don't cover embeddings well).
 *
 * The same model MUST be used for ingestion and retrieval, and the Pinecone index
 * dimension must match it: llama-text-embed-v2 = 1024, gemini-embedding-001 = 3072,
 * text-embedding-3-small = 1536. Switching means a new Pinecone index and re-uploading PDFs.
 */
const embeddingProvider =
  process.env.EMBEDDING_PROVIDER || (llmProvider === "openrouter" ? "pinecone" : llmProvider);

function makeEmbeddings(): Embeddings {
  const model = process.env.EMBEDDING_MODEL;
  if (embeddingProvider === "pinecone") {
    return new PineconeInferenceEmbeddings(model || "llama-text-embed-v2");
  }
  if (embeddingProvider === "gemini") {
    return new GoogleGenerativeAIEmbeddings({
      model: model || "gemini-embedding-001",
      apiKey: process.env.GOOGLE_API_KEY,
    });
  }
  return new OpenAIEmbeddings({
    model: model || "text-embedding-3-small",
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

export const embeddings = makeEmbeddings();
