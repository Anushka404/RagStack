import { utilityModel } from "@/lib/ai/model";
import { REWRITE_PROMPT, ENTITY_EXTRACT_PROMPT } from "@/lib/ai/prompts";
import { HumanMessage } from "@langchain/core/messages";
import { Thread } from "@/types/memory";

const VAGUE_PRONOUNS = ["his", "her", "their", "them", "he", "she", "it", "this", "that"];

/**
 * Detects whether a query contains vague pronouns that need resolution.
 */
export function needsRewrite(query: string): boolean {
  const lower = query.toLowerCase();
  return VAGUE_PRONOUNS.some((word) => {
    const re = new RegExp(`\\b${word}\\b`);
    return re.test(lower);
  });
}

/**
 * Rewrites a vague query using the thread's entity memory.
 * Returns the rewritten query, or the original if no rewrite is needed.
 */
export async function rewriteQuery(
  currentQuery: string,
  thread: Thread
): Promise<{ retrievalQuery: string; wasRewritten: boolean }> {
  if (!needsRewrite(currentQuery)) {
    return { retrievalQuery: currentQuery, wasRewritten: false };
  }

  const entity = thread.entities[thread.entities.length - 1] ?? null;

  if (!entity) {
    // No entity in memory — can't rewrite
    return { retrievalQuery: currentQuery, wasRewritten: false };
  }

  const recentMessages = thread.messages.slice(-4);
  const previousQuery =
    [...recentMessages].reverse().find((m) => m.role === "user")?.content ?? "";

  const prompt = await REWRITE_PROMPT.format({
    currentQuery,
    previousQuery,
    entity,
  });

  const result = await utilityModel.invoke([new HumanMessage(prompt)]);
  const rewritten = (result.content as string).trim();

  console.log(`🔁 Query rewritten: "${currentQuery}" → "${rewritten}"`);

  return { retrievalQuery: rewritten, wasRewritten: true };
}

/**
 * Extracts the main person/org entity from a text snippet.
 * Returns null if none found.
 */
export async function extractEntity(text: string): Promise<string | null> {
  if (!text || text.trim().length < 10) return null;

  const prompt = await ENTITY_EXTRACT_PROMPT.format({ text: text.slice(0, 500) });
  const result = await utilityModel.invoke([new HumanMessage(prompt)]);
  const name = (result.content as string).trim();

  return name && name.toLowerCase() !== "none" ? name : null;
}
