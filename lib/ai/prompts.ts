import { PromptTemplate } from "@langchain/core/prompts";

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
- When you reference something from the document, you may naturally mention the source (e.g., "According to page 3...").

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
 * Query rewrite prompt.
 * Variables: {currentQuery}, {previousQuery}, {entity}
 */
export const REWRITE_PROMPT = PromptTemplate.fromTemplate(`
You are a query rewriter for a document Q&A assistant.
The user asked a follow-up question with vague pronouns like "he", "she", "his", "her", "they", "it".

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
