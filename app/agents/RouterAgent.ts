import OpenAI from "openai";
import { expandQuery, needsExpansion } from "./QueryExpanderAgent";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type RouterOutput = {
  shouldRewrite: boolean;
  expandedQuery: string;
  resolvedEntity: string | null;
  reason: string;
};

/**
 * Main Router Agent to decide whether to trigger QueryExpanderAgent.
 * Later will route to other tools like summarizer, document reader, etc.
 */
export async function routeQuery(
  currentQuery: string,
  previousQuery?: string
): Promise<RouterOutput> {
  const needsRewriting = needsExpansion(currentQuery);

  if (!needsRewriting) {
    const entity = await extractEntityName(currentQuery);
    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: entity,
      reason: entity
        ? `Explicit query, resolved entity as "${entity}"`
        : "Explicit query, but no entity could be extracted",
    };
  }

  if (!previousQuery) {
    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: null,
      reason: "No previous query available to resolve pronouns",
    };
  }

  // Ask GPT to resolve the entity from the previous query
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

  if (entity.toLowerCase() === "none") {
    return {
      shouldRewrite: false,
      expandedQuery: currentQuery,
      resolvedEntity: null,
      reason: "Unable to resolve entity from previous query",
    };
  }

  // Now call QueryExpanderAgent
  const rewritten = await expandQuery(currentQuery, previousQuery, entity);

  return {
    shouldRewrite: true,
    expandedQuery: rewritten,
    resolvedEntity: entity,
    reason: `Query contained vague pronoun, resolved using previous query mentioning "${entity}"`,
  };
}

async function extractEntityName(query: string): Promise<string | null> {
  const prompt = `
Identify the main person this query is about. Only respond with the name of the person. 
If it's unclear, respond with "none".

Query: "${query}"
Person:
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const name = response.choices[0].message.content?.trim();
  return name && name.toLowerCase() !== "none" ? name : null;
}
