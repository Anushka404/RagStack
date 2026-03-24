import { chatModel } from "@/lib/ai/model";
import { RAG_PROMPT } from "@/lib/ai/prompts";
import { RetrievedDoc } from "@/types/rag";
import { ThreadMessage } from "@/types/memory";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Streams the answer to the controller given context and thread history.
 * Writes text chunks to the ReadableStream controller.
 */
export async function streamAnswer(
  question: string,
  docs: RetrievedDoc[],
  history: ThreadMessage[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<string> {
  // Build context string
  const context = docs
    .map((doc) => {
      const page = doc.metadata.pageNumber ? `[Page ${doc.metadata.pageNumber}]` : "";
      return `${page}\n${doc.content}`.trim();
    })
    .join("\n\n---\n\n");

  // Build recent conversation history (last 6 messages)
  const recentHistory = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  // Fill prompt
  const filledPrompt = await RAG_PROMPT.format({
    context: context || "No relevant document context found.",
    history: recentHistory || "No prior conversation.",
    question,
  });

  // Stream response
  let fullText = "";
  const stream = await chatModel.stream([new HumanMessage(filledPrompt)]);

  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) {
      fullText += text;
      controller.enqueue(encoder.encode(text));
    }
  }

  return fullText;
}
