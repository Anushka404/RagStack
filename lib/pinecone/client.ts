import { Pinecone } from "@pinecone-database/pinecone";

let _pinecone: Pinecone | null = null;

/**
 * Returns a singleton Pinecone client.
 */
export function getPineconeClient(): Pinecone {
  if (!_pinecone) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY is not set in environment variables.");
    }
    _pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return _pinecone;
}

export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "askpdf";
