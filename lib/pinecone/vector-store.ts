import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
import { getPineconeClient, PINECONE_INDEX_NAME } from "./client";
import { embeddings } from "@/lib/ai/embeddings";

/**
 * Returns a LangChain PineconeStore scoped to the user's namespace.
 */
export async function getVectorStore(namespace: string): Promise<PineconeStore> {
  const pinecone = getPineconeClient();
  const index = pinecone.index(PINECONE_INDEX_NAME).namespace(namespace);
  return PineconeStore.fromExistingIndex(embeddings, { pineconeIndex: index as any, namespace });
}

/**
 * Ingests documents into Pinecone under the user's namespace.
 */
export async function ingestDocuments(docs: Document[], namespace: string): Promise<void> {
  const pinecone = getPineconeClient();
  const index = pinecone.index(PINECONE_INDEX_NAME).namespace(namespace);
  await PineconeStore.fromDocuments(docs, embeddings, { pineconeIndex: index as any, namespace });
}

/**
 * Returns stats for the full index (all namespaces).
 */
export async function getIndexStats() {
  const pinecone = getPineconeClient();
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();
  return stats;
}
