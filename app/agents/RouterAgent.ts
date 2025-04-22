import OpenAI from "openai";
import { expandQuery, needsExpansion } from "./QueryExpanderAgent";
import { getLastEntity, setLastEntity } from "@/app/utils/contextMemory";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type RouterOutput = {
  shouldRewrite: boolean;
  expandedQuery: string;
  resolvedEntity: string | null;
  reason: string;
};

/**
 * Main Router Agent to decide whether to trigger QueryExpanderAgent.
 * Handles pronoun resolution and user-scoped memory.
 */
export async function routeQuery(
  currentQuery: string,
  previousQuery: string | undefined,
  userId: string
): Promise<RouterOutput> {
  const needsRewriting = needsExpansion(currentQuery);

  // 1️⃣ Handle explicit query (no pronouns)
  if (!needsRewriting) {
    const entity = await extractEntityName(currentQuery);
    if (entity) setLastEntity(userId, entity); // user-scoped memory
    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: entity,
      reason: entity
        ? `Explicit query, resolved entity as "${entity}"`
        : "Explicit query, but no entity could be extracted",
    };
  }

  // 2️⃣ If vague, but no previousQuery, try fallback memory
  if (!previousQuery) {
    const last = getLastEntity(userId);
    if (last) {
      const rewritten = await expandQuery(currentQuery, "", last);
      return {
        shouldRewrite: true,
        expandedQuery: rewritten,
        resolvedEntity: last,
        reason: `Used last remembered entity "${last}" to resolve vague pronouns`,
      };
    }

    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: null,
      reason: "No previous query or memory to resolve pronouns",
    };
  }

  // 3️⃣ Try extracting entity from previous query
  const entityPrompt = `
The user previously asked: "${previousQuery}"
Now they asked: "${currentQuery}"

From the previous query, what is the main person or organization being referred to?
Only reply with the name. If unsure, say "none".
`;

  const entityResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: entityPrompt }],
    temperature: 0.2,
  });

  const entity = entityResponse.choices[0].message.content?.trim() || "none";

  // 4️⃣ Fallback: Use last memory if extraction failed
  if (entity.toLowerCase() === "none") {
    const last = getLastEntity(userId);
    if (last) {
      const rewritten = await expandQuery(currentQuery, previousQuery, last);
      return {
        shouldRewrite: true,
        expandedQuery: rewritten,
        resolvedEntity: last,
        reason: `Unable to resolve from previous query, so used remembered entity "${last}"`,
      };
    }

    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: null,
      reason: "Unable to resolve entity from previous query or memory",
    };
  }

  // 5️⃣ Entity successfully extracted → store it
  setLastEntity(userId, entity);

  const rewritten = await expandQuery(currentQuery, previousQuery, entity);
  console.log("re-written query", rewritten);

  return {
    shouldRewrite: true,
    expandedQuery: rewritten,
    resolvedEntity: entity,
    reason: `Query contained vague pronoun, resolved using previous query mentioning "${entity}"`,
  };
}

/**
 * Extracts the main person entity from an explicit query.
 */
export async function extractEntityName(query: string): Promise<string | null> {
  const prompt = `
From the following query, extract the name of the main person being talked about.
Only return the name. If there's no person or it's unclear, return "none".

Query: "${query}"
Person:
`;

  const result = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const name = result.choices[0].message.content?.trim();
  return name && name.toLowerCase() !== "none" ? name : null;
}

/**
 * Extracts the main person entity from a GPT answer.
 */
export async function extractEntityNameFromText(text: string): Promise<string | null> {
  const prompt = `
From the following assistant answer, extract the name of the main person being referred to.
Only return the name. If there's no person or it's unclear, return "none".

Answer: "${text}"
Person:
`;

  const result = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const name = result.choices[0].message.content?.trim();
  return name && name.toLowerCase() !== "none" ? name : null;
}
