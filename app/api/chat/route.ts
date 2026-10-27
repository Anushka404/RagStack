import { NextRequest, NextResponse, after } from "next/server";
import { parseFilters } from "@/lib/rag/retrieve";
import { hybridRetrieve } from "@/lib/rag/hybrid";
import { rewriteQuery, extractEntity } from "@/lib/rag/query-rewrite";
import { streamAnswer } from "@/lib/rag/answer";
import { assembleContext } from "@/lib/rag/context";
import { listUserDocuments } from "@/lib/db/documents";
import { isNotFoundAnswer } from "@/lib/ai/prompts";
import { loadThreadMemory } from "@/lib/rag/memory";
import { verificationEnabled, verifyAnswer } from "@/lib/rag/verify";
import { extractCitations } from "@/lib/rag/claims";
import { SourceRef } from "@/types/chat";
import { RetrievalTrace, RetrievedDoc } from "@/types/rag";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { ensureThread, saveEntity, setThreadTitleIfEmpty } from "@/lib/db/threads";
import { countRecentQuestions, saveMessage } from "@/lib/db/messages";

export const runtime = "nodejs";

export const maxDuration = 60;

/** Questions per user per minute; protects the shared LLM quota. */
const RATE_LIMIT_PER_MINUTE = 10;

export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now();
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, message } = body as { threadId?: string; message?: string };
    const filters = parseFilters(body.filters);

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }
    if ((await countRecentQuestions(supabase, user.id)) >= RATE_LIMIT_PER_MINUTE) {
      return NextResponse.json(
        { error: `Too many questions: the limit is ${RATE_LIMIT_PER_MINUTE} per minute. Wait a moment and try again.` },
        { status: 429 }
      );
    }

    // Memory is rebuilt from the DB on every request (history excludes this message).
    const [, thread] = await Promise.all([
      ensureThread(supabase, user.id, threadId),
      loadThreadMemory(supabase, user.id, threadId),
    ]);

    // Persist the question and title the chat while rewriting; the document list
    // tells query understanding which years and collections exist.
    const [{ retrievalQuery, wasRewritten }, , , documents] = await Promise.all([
      rewriteQuery(message, thread),
      saveMessage(supabase, user.id, threadId, "user", message),
      setThreadTitleIfEmpty(supabase, user.id, threadId, message),
      listUserDocuments(supabase, user.id),
    ]);
    const rewrittenAt = Date.now();

    const ready = documents.filter((d) => d.status === "ready");
    const retrieval = await hybridRetrieve(supabase, user.id, retrievalQuery, filters, {
      years: [...new Set(ready.map((d) => d.year).filter((y): y is number => y !== null))],
      collections: [...new Set(ready.map((d) => d.collection))],
    });
    const { context, used, dropped } = assembleContext(retrieval.docs);
    const retrievedAt = Date.now();

    const toSource = (doc: RetrievedDoc): SourceRef => ({
      fileName: doc.metadata.fileName,
      pageNumber: doc.metadata.pageNumber,
      textPreview: doc.metadata.textPreview,
    });

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
        // Writes fail once the browser disconnects; keep going so the reply is still saved.
        const send = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch { /* client gone */ } };
        try {
          const { text, model } = await streamAnswer(message, context, thread.messages, send);
          const answeredAt = Date.now();

          // Sources are the passages the answer cites as [n]; a "not found" reply cites nothing,
          // and an answer without markers falls back to everything that was in the context.
          const notFound = isNotFoundAnswer(text);
          const citations = extractCitations(text, used.length);
          const cited = notFound ? [] : (citations.length ? citations.map((n) => used[n - 1]) : used).map(toSource);
          const dropReason = new Map(dropped.map((d) => [d.doc.id, d.reason]));
          const trace: RetrievalTrace = {
            query: message,
            ...(wasRewritten ? { retrievalQuery } : {}),
            filters: retrieval.filters,
            detected: retrieval.plan,
            searches: retrieval.searches,
            reranker: retrieval.reranker,
            chunks: retrieval.docs.map((d) => ({
              fileName: d.metadata.fileName,
              pageNumber: d.metadata.pageNumber,
              chunkIndex: d.metadata.chunkIndex,
              score: d.score,
              preview: d.content.slice(0, 300),
              signals: d.signals,
              ...(used.includes(d) ? { contextIndex: used.indexOf(d) + 1 } : { dropped: dropReason.get(d.id) }),
            })),
            contextChars: context.length,
            model,
            timings: {
              prepare: rewrittenAt - startedAt,
              search: retrieval.timings.search,
              rerank: retrieval.timings.rerank,
              generate: answeredAt - retrievedAt,
              total: answeredAt - startedAt,
            },
          };

          // Sources and trace go out right away; the claim check follows in its own block.
          send(`\n\n__META__${JSON.stringify({ sources: cited, trace })}__END_META__`);

          if (verificationEnabled && !notFound && used.length > 0) {
            const verifyStart = Date.now();
            trace.verification = await verifyAnswer(text, context, used.length);
            trace.timings.verify = Date.now() - verifyStart;
            send(`__VERIFY__${JSON.stringify({ verification: trace.verification, ms: trace.timings.verify })}__END_VERIFY__`);
          }

          await saveMessage(supabase, user.id, threadId, "assistant", text, cited, trace);
          resolveAnswer(text);
        } catch (error) {
          console.error("Chat stream error:", error);
          resolveAnswer(null);
          // The 200 status is already sent, so the error has to travel in the stream itself.
          const reason = error instanceof Error ? error.message : "Unknown error";
          send(`\n\n⚠️ Error: ${reason}`);
        } finally {
          try { controller.close(); } catch { /* already closed by a disconnect */ }
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
