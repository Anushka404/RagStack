import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
  throw new Error("Missing OpenAI or Pinecone API Key in environment variables");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index("knowledge-base");

const SYSTEM_PROMPT = `You are a helpful assistant. Answer the user's query based *only* on the provided context.
If the context does not contain the information needed to answer the query, state that clearly.
Do not make up information. Be concise and directly address the query.Give this answer in suited for a voice assistant.

Rules:
- If the user's question asks about a specific person, you must **only respond** if the context explicitly contains that person.
- Do NOT guess or assume facts based on similar people.
- If the context doesn't mention that person, say: "The context does not include information about [person]."

Context:
---
{CONTEXT}
---
`;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    console.time("Total Request");

    // Generate query embedding
    console.time("Embedding");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    console.timeEnd("Embedding");

    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) {
      throw new Error("Failed to generate query embedding.");
    }

    // Create a ReadableStream to send chunks to the client
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send marker immediately after embedding is generated
          controller.enqueue(encoder.encode("__CONTEXT_READY__"));
          
          // Search Pinecone
          console.time("Pinecone Query");
          const searchResults = await pineconeIndex.query({
            vector: queryEmbedding,
            topK: 10,
            includeMetadata: true,
          
    
            
          });
          console.timeEnd("Pinecone Query");
          console.log(searchResults);

          if (!searchResults.matches || searchResults.matches.length === 0) {
            console.log("No relevant data found in Pinecone.");
            controller.enqueue(encoder.encode("I could not find relevant information to answer your query."));
            controller.close();
            return;
          }

          // Prepare Context
          const context = searchResults.matches
            .map((match) => match.metadata?.text)
            .filter(Boolean)
            .join("\n\n---\n\n");

          if (!context || context.trim().length === 0) {
            console.log("Context retrieved from Pinecone was empty.");
            controller.enqueue(encoder.encode("I found some related documents, but could not extract usable context to answer your query."));
            controller.close();
            return;
          }

          console.log("Context Length:", context.length);
          const filledPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", context);

          console.time("Chat Completion (Streaming)");
          const stream = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
              { role: "system", content: filledPrompt },
              { role: "user", content: query },
            ],
            temperature: 0.2,
            stream: true,
          });

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    console.timeEnd("Total Request");

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain" },
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
