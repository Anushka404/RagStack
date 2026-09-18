import { NextRequest, NextResponse, after } from "next/server";
import { retrieveDocuments } from "@/lib/rag/retrieve";
import { rewriteQuery, extractEntity } from "@/lib/rag/query-rewrite";
import { streamAnswer } from "@/lib/rag/answer";
import { loadThreadMemory } from "@/lib/rag/memory";
import { SourceRef } from "@/types/chat";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { ensureThread, saveEntity } from "@/lib/db/threads";
import { saveMessage } from "@/lib/db/messages";

export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, message } = body as { threadId?: string; message?: string };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    // Memory is rebuilt from the DB on every request (history excludes this message).
    const [, thread] = await Promise.all([
      ensureThread(supabase, user.id, threadId),
      loadThreadMemory(supabase, user.id, threadId),
    ]);

    // Persist user message while rewriting + retrieving
    const saveUserMessage = saveMessage(supabase, user.id, threadId, "user", message);

    const { retrievalQuery, wasRewritten } = await rewriteQuery(message, thread);
    if (wasRewritten) console.log(`🔁 Retrieval query: "${retrievalQuery}"`);

    // Retrieve from user's namespace only
    const [docs] = await Promise.all([
      retrieveDocuments(retrievalQuery, user.id),
      saveUserMessage,
    ]);

    const sources: SourceRef[] = docs.map((doc) => ({
      fileName: doc.metadata.fileName,
      pageNumber: doc.metadata.pageNumber,
      textPreview: doc.metadata.textPreview,
    }));

    const encoder = new TextEncoder();

    // Entity extraction runs after the response finishes; after() keeps the
    // serverless function alive for it instead of a fire-and-forget promise.
    let resolveAnswer: (text: string | null) => void = () => {};
    const answerDone = new Promise<string | null>((r) => (resolveAnswer = r));
    after(async () => {
      const text = await answerDone;
      if (!text) return;
      try {
        const entity = await extractEntity(text);
        if (entity) {
          await saveEntity(supabase, user.id, threadId, entity);
          console.log(`🧠 Entity remembered: "${entity}"`);
        }
      } catch { /* best effort */ }
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fullResponseText = await streamAnswer(
            message, docs, thread.messages, controller, encoder
          );

          // Save before closing so the reply is persisted even if the client disconnects.
          await saveMessage(supabase, user.id, threadId, "assistant", fullResponseText, sources);

          if (sources.length > 0) {
            controller.enqueue(encoder.encode(`\n\n__SOURCES__${JSON.stringify(sources)}__END_SOURCES__`));
          }
          controller.close();
          resolveAnswer(fullResponseText);
        } catch (error) {
          resolveAnswer(null);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
