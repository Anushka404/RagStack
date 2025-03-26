import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

    // Generate query embedding
    const embedding = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    console.log("Query Embedding:", embedding.data[0].embedding);

    // Search Pinecone 
    const index = pinecone.index("knowledge-base");
    const searchResults = await index.query({
      vector: embedding.data[0].embedding,
      topK: 5,
      includeMetadata: true,
    });

    if (searchResults.matches.length === 0) {
      return NextResponse.json({ message: "No relevant data found." }, { status: 404 });
    }

    const context = searchResults.matches.map((match) => match.metadata?.text).join("\n");

    //  assistant 
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Based on this retrieved data, answer: ${query}\n\nData:\n${context}`,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: "asst_QEqrhjr5lpGcaPKFV6vjXQiw",
    });

    let response;
    while (!response) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      if (runStatus.status === "completed") {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const content = messages.data[0].content[0];
        if ("text" in content) {
          response = content.text.value;
        } else {
          throw new Error("Unexpected content type");
        }
      }
    }
    console.log("Response:", response);
    return NextResponse.json({ response });
    
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
