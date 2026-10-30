import { PromptTemplate } from "@langchain/core/prompts";
import { DEMO_STAGE } from "@/lib/stage";

// Inline [n] citations are part of demo stage 3; earlier stages mention the page in prose.
const CITATION_RULE = DEMO_STAGE >= 3
  ? "- After each sentence that uses the context, cite the supporting passages by number in square brackets, like [1] or [2][3]. Cite only passages that actually support that sentence."
  : '- When you reference something from the document, you may naturally mention the source (e.g., "According to page 3...").';

/**
 * Main RAG system prompt.
 * Variables: {context}, {history}, {question}
 */
export const RAG_PROMPT = PromptTemplate.fromTemplate(`
You are a helpful document assistant. Answer the user's question using ONLY the provided document context below.

Rules:
- Answer ONLY from the provided context. Do NOT make up information.
- If the context does not contain the answer, say: "I couldn't find that in the uploaded document."
- If the user asks about a specific person, only respond if that person is explicitly mentioned in the context.
- Be concise and direct.
- Each passage starts with a label like "[2] report.pdf · 2026 · page 3" giving its source, year and page.
- When the question compares years or documents, answer side by side (one point per year or document), and say plainly when one side has no information.
${CITATION_RULE}

Recent Conversation:
{history}

Document Context:
---
{context}
---

User Question: {question}

Answer:
`);

/**
 * True when the model gave RAG_PROMPT's "not found" reply (straight or curly apostrophe).
 * ponytail: phrase match, so a partial answer that also says it loses its sources;
 * replace with per-claim citations once answer verification exists.
 */
export function isNotFoundAnswer(text: string): boolean {
  return /couldn['’]t find that in the uploaded document/i.test(text);
}

/**
 * Post-generation verification prompt (synopsis layer 4): checks each claim of an
 * answer against the numbered passages it was generated from.
 * Variables: {context}, {answer}
 */
export const VERIFY_PROMPT = PromptTemplate.fromTemplate(`
You are checking an answer against the source passages it was generated from.

Passages:
---
{context}
---

Answer to check:
{answer}

Split the answer into its factual claims (at most 8; ignore greetings, filler and citation markers).
For each claim, decide whether the passages explicitly support it. Paraphrases count; facts not stated in the passages do not.
Respond with JSON only, no other text, in exactly this shape:
{{"claims": [{{"claim": "short restatement of the claim", "supported": true, "sources": [1]}}]}}
"sources" lists the passage numbers that support the claim, and is empty when the claim is unsupported.
`);

/**
 * Query rewrite prompt.
 * Variables: {currentQuery}, {previousQuery}, {entity}
 */
export const REWRITE_PROMPT = PromptTemplate.fromTemplate(`
You are a query rewriter for a document Q&A assistant.
The user asked a follow-up question with vague pronouns like "he", "she", "his", "her", "they".
Only replace pronouns that refer to a person or organization; leave "it", "this" and "that" alone.

Known entity from prior conversation: {entity}

Previous Question: "{previousQuery}"
Follow-up Question: "{currentQuery}"

Rewrite the follow-up question to be self-contained by replacing the pronouns with the known entity.
If the question is already self-contained, return it unchanged.

Rewritten Question:
`);

/**
 * Entity extraction prompt.
 * Variable: {text}
 */
export const ENTITY_EXTRACT_PROMPT = PromptTemplate.fromTemplate(`
From the following text, extract the name of the main person or organization being discussed.
Return ONLY the name. If there is none or it is unclear, return "none".

Text: "{text}"
Name:
`);
