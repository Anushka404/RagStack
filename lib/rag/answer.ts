import { chatModel, chatModelName } from "@/lib/ai/model";
import { RAG_PROMPT } from "@/lib/ai/prompts";
import { ThreadMessage } from "@/types/memory";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Streams the answer for an assembled context, passing each text piece to onText.
 * Returns the full text and the model that actually answered (OpenRouter may fall back).
 */
export async function streamAnswer(
  question: string,
  context: string,
  history: ThreadMessage[],
  onText: (text: string) => void
): Promise<{ text: string; model: string }> {
  // Build recent conversation history (last 6 messages)
  const recentHistory = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const filledPrompt = await RAG_PROMPT.format({
    context: context || "No relevant document context found.",
    history: recentHistory || "No prior conversation.",
    question,
  });

  let fullText = "";
  let model = chatModelName;
  const stream = await chatModel.stream([new HumanMessage(filledPrompt)]);

  for await (const chunk of stream) {
    const served = chunk.response_metadata?.model_name;
    if (typeof served === "string" && served) model = served;
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) {
      fullText += text;
      onText(text);
    }
  }

  return { text: fullText, model };
}
