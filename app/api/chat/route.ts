import { NextRequest, NextResponse } from "next/server";
import { retrieveDocuments } from "@/lib/rag/retrieve";
import { rewriteQuery, extractEntity } from "@/lib/rag/query-rewrite";
import { streamAnswer } from "@/lib/rag/answer";
import {
  getOrCreateThread,
  addMessage,
  setEntity,
  setLastRetrievalQuery,
} from "@/lib/rag/memory";
import { SourceRef } from "@/types/chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureThread, saveEntity } from "@/lib/db/threads";
import { saveMessage } from "@/lib/db/messages";

export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
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

    // Ensure thread in DB + memory
    await ensureThread(supabase, user.id, threadId);
    const thread = getOrCreateThread(threadId);
    addMessage(threadId, "user", message);

    // Persist user message
    await saveMessage(supabase, user.id, threadId, "user", message);

    // Rewrite query
    const { retrievalQuery, wasRewritten } = await rewriteQuery(message, thread);
    setLastRetrievalQuery(threadId, retrievalQuery);
    if (wasRewritten) console.log(`🔁 Retrieval query: "${retrievalQuery}"`);

    // Retrieve from user's namespace only
    const docs = await retrieveDocuments(retrievalQuery, user.id);

    const sources: SourceRef[] = docs.map((doc) => ({
      fileName: doc.metadata.fileName,
      pageNumber: doc.metadata.pageNumber,
      textPreview: doc.metadata.textPreview,
    }));

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const fullResponseText = await streamAnswer(
            message, docs, thread.messages.slice(0, -1), controller, encoder
          );

          if (sources.length > 0) {
            controller.enqueue(encoder.encode(`\n\n__SOURCES__${JSON.stringify(sources)}__END_SOURCES__`));
          }
          controller.close();

          addMessage(threadId, "assistant", fullResponseText);
          await saveMessage(supabase, user.id, threadId, "assistant", fullResponseText, sources);

          extractEntity(fullResponseText)
            .then(async (entity) => {
              if (entity) {
                setEntity(threadId, entity);
                await saveEntity(supabase, user.id, threadId, entity);
                console.log(`🧠 Entity remembered: "${entity}"`);
              }
            })
            .catch(() => {});
        } catch (error) {
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
