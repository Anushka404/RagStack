import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const vagueWords = ["his", "her", "their", "them", "he", "she"];

/**
 * Returns true if the query contains vague pronouns.
 */
export function needsExpansion(query: string): boolean {
  const lower = query.toLowerCase();
  return vagueWords.some(word => lower.includes(` ${word} `));
}

/**
 * Expands vague follow-up queries using the resolved entity.
 */
export async function expandQuery(
  currentQuery: string,
  previousQuery: string,
  entity: string
): Promise<string> {
  const prompt = `
You are a query rewriter for a multi-turn assistant.
The user asked a follow-up question and used vague pronouns like "his", "her", "he", "they".

You must rewrite the query to replace those pronouns with the known entity name:
Entity: ${entity}

If the follow-up query is already specific or does not need rewriting, return it unchanged.

Previous Query: "${previousQuery}"
Follow-up Query: "${currentQuery}"

Rewritten Query:
`;

  const result = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  return result.choices[0].message.content?.trim() || currentQuery;
}
