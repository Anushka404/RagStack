/**
 * Which build stage the app presents, mapped to the synopsis layers, so each project
 * review can show the next milestone (set NEXT_PUBLIC_DEMO_STAGE; restart the server):
 *  1 = ingestion and indexing (layers 1–2) with plain semantic chat
 *  2 = + context engineering (layer 3): filters, hybrid search, reranking, query understanding
 *  3 = + generation checks and evaluation (layer 4): citations, claim check, Evaluation page
 * Readable on server and client (NEXT_PUBLIC_ values are inlined into the browser bundle).
 */
export const DEMO_STAGE = Math.min(3, Math.max(1, Number(process.env.NEXT_PUBLIC_DEMO_STAGE) || 3));
