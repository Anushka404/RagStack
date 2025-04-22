import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { routeQuery } from "@/app/agents/RouterAgent";

if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
  throw new Error("Missing OpenAI or Pinecone API Key in environment variables");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pinecone.index("knowledge-base");

const lastQueryMap = new Map<string, string>();

const SYSTEM_PROMPT = `You are a helpful assistant. Answer the user's query based *only* on the provided context.
If the context does not contain the information needed to answer the query, state that clearly.
Do not make up information. Be concise and directly address the query. Give this answer in suited for a voice assistant.

Rules:
- If the user's question asks about a specific person, you must **only respond** if the context explicitly contains that person.
- Do NOT guess or assume facts based on similar people.
- If the context doesn't mention that person, say: "The context does not include information about [person]."
- Make sure you don't answer wrong information about people and only answer if the context has their information.

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

    const userId = req.headers.get("x-user-id") || "anonymous";
    const lastQuery = lastQueryMap.get(userId);

    const { expandedQuery, shouldRewrite, resolvedEntity, reason } = await routeQuery(query, lastQuery);
    const finalQuery = expandedQuery;

    console.log(" Router Decision:", { shouldRewrite, resolvedEntity, reason });
    console.log(" Final Query to GPT:", finalQuery);

    lastQueryMap.set(userId, finalQuery);

    console.time("Embedding");
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: finalQuery,
    });
    console.timeEnd("Embedding");

    const queryEmbedding = embeddingResponse.data[0]?.embedding;
    if (!queryEmbedding) throw new Error("Failed to generate query embedding.");

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode("__CONTEXT_READY__"));

          // 🔍 Pinecone Search
          console.time("Pinecone Query");
          const pineconeQueryOptions: any = {
            vector: queryEmbedding,
            topK: 10,
            includeMetadata: true,
          };

          if (resolvedEntity) {
            pineconeQueryOptions.filter = {
              people: { $in: [resolvedEntity] }
            };
          }

          console.log("🔎 Pinecone filter being used:", pineconeQueryOptions.filter || "none");

          const searchResults = await pineconeIndex.query(pineconeQueryOptions);
          console.timeEnd("Pinecone Query");

          // 🧾 Log each match
          // console.log(" Pinecone Returned Matches:");
          // searchResults.matches.forEach((match, i) => {
          //   const id = match.id;
          //   const score = match.score?.toFixed(4);
          //   const people = match.metadata?.people || [];
          //   const textPreview = match.metadata?.text?.slice(0, 100)?.replace(/\n/g, " ");
          //   console.log(`• #${i + 1} | ID: ${id} | Score: ${score} | People: ${JSON.stringify(people)} | Text: "${textPreview}..."`);
          // });

          if (!searchResults.matches || searchResults.matches.length === 0) {
            controller.enqueue(encoder.encode("I could not find relevant information to answer your query."));
            controller.close();
            return;
          }

          const context = searchResults.matches
            .map(match => match.metadata?.text)
            .filter(Boolean)
            .join("\n\n---\n\n");

          if (!context || context.trim().length === 0) {
            controller.enqueue(encoder.encode("I found some related documents, but could not extract usable context to answer your query."));
            controller.close();
            return;
          }

          // 🧠 Log final context
          console.log("🧠 Final context sent to GPT:\n", context.slice(0, 1000), "\n...");

          const filledPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", context);

          // 💬 Stream GPT Response
          console.time("Chat Completion (Streaming)");
          const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: filledPrompt },
              { role: "user", content: finalQuery },
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

          console.timeEnd("Chat Completion (Streaming)");
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
