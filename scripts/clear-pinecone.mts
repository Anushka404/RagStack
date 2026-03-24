import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index(process.env.PINECONE_INDEX_NAME!);

console.log(`Deleting all vectors from index: ${process.env.PINECONE_INDEX_NAME}`);
await index.deleteAll();
console.log("Done.");
