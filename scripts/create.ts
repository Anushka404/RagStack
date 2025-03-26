

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import "dotenv/config";


// Debugging environment variables
// console.log("🔍 PINECONE_API_KEY:", process.env.PINECONE_API_KEY);
// console.log("🔍 PINECONE_INDEX_NAME:", process.env.PINECONE_INDEX_NAME);
// console.log("🔍 OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });


async function insertData(id: string, text: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  await index.upsert([{ id, values: embedding.data[0].embedding, metadata: { text } }]);

  console.log(`✅ Inserted: ${id}`);
}
async function queryData(query: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query,
  });

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  const response = await index.query({
    vector: embedding.data[0].embedding,
    topK: 2,
    includeMetadata: true,
  });

  console.log("🔍 Query Results:", JSON.stringify(response, null, 2));
}

// Sample Data
const documents = [
  { id: "dat1", text: "Simply Cue is a company engaged in developing and hosting technology-based event platforms with built-in state-of-the-art audio/video streaming capabilities for live and recorded content." },
  { id: "dat2", text: "Simply Cue helps creators build communities, monetize their on-demand and interactive live streaming content, and capture actionable analytics to develop marketing and sales performance strategies" },
];

async function main() {
  // for (const doc of documents) {
  //   await insertData(doc.id, doc.text);
  // }
  await queryData("What does Simply Cue do?");
}

main().catch(console.error);
