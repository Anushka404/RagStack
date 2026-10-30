# RAGStack

A context-engineering layer that gives an LLM the right domain-specific evidence through
intelligent retrieval, instead of retraining it. Upload documents into collections, ask
questions, and get answers with numbered citations that are checked claim by claim against
their sources.

Built with **Next.js**, **LangChain**, **Pinecone** (vectors, embeddings, reranking) and
**Supabase** (auth, Postgres, full-text search, file storage). Every service runs on a free tier.

---

## How it maps to the synopsis architecture

| Layer | What it does | Where |
|---|---|---|
| **1. Universal ingestion** | PDF, DOCX, TXT, Markdown, CSV; OCR of scanned and handwritten PDF pages with a free vision model; repeated headers/footers removed; resumable time-boxed processing | `lib/pdf/loader.ts`, `lib/pdf/ocr.ts`, `lib/pdf/parse.ts`, `lib/rag/ingest.ts` |
| **2. Multi-representation indexing** | 1000/150 chunks with collection, year, tags and page metadata, embedded into Pinecone and indexed for full-text search in Postgres | `lib/rag/chunking.ts`, `lib/rag/metadata.ts`, `lib/db/chunks.ts` |
| **3. Context engineering and retrieval** | Query understanding (years, collections, comparisons) → semantic + keyword search → reciprocal rank fusion → cross-encoder reranking → context builder (dedupe, budget, ordering) | `lib/rag/query-understanding.ts`, `lib/rag/hybrid.ts`, `lib/rag/fusion.ts`, `lib/rag/rerank.ts`, `lib/rag/context.ts` |
| **Namespace router** | Collection / year / document filters chosen in the UI or read from the question | `lib/rag/retrieve.ts` (`toPineconeFilter`), `search_chunks_keyword` SQL |
| **4. Generation and verification** | Model-agnostic LLM (OpenRouter, Gemini, OpenAI), inline `[n]` citations, a second pass that checks each claim against the passages | `lib/rag/answer.ts`, `lib/rag/verify.ts`, `lib/rag/claims.ts` |
| **Evaluation** | Live latency/faithfulness metrics from chats, and a retrieval benchmark (hit rate, MRR) comparing semantic-only, hybrid and full pipeline | `app/evaluation`, `lib/rag/evaluate.ts` |

## Pages

- **Chat**: answers with citations, a claim check, and "How this answer was found" (query, filters, per-search hits, semantic/keyword ranks, rerank scores, context size, model, time per stage).
- **Knowledge base**: tree of Collection → Year → Document → Page → Chunk with the metadata of each node, upload with a step-by-step ingestion view, delete and retry.
- **Evaluation**: metrics from your chats plus the retrieval benchmark.

---

## Setup (free tiers, plus a few cents of OpenRouter credit)

1. **OpenRouter API key**: https://openrouter.ai/keys, with `LLM_PROVIDER=openrouter`. The default models are free
   Nemotron VL with thinking off, falling back to Qwen 3.7 Flash (about $0.0001 a call) when the free pool is busy.
   Embeddings and reranking then use Pinecone's free hosted models with your Pinecone key.
   _Alternatives: `LLM_PROVIDER=gemini` + `GOOGLE_API_KEY`, or `openai` + `OPENAI_API_KEY`. With either, set
   `EMBEDDING_PROVIDER=pinecone` to keep the 1024-dimension index._
2. **Pinecone** (free Starter): create a serverless index (Custom settings, dense, metric `cosine`)
   with dimension `1024` for Pinecone embeddings, `3072` for Gemini or `1536` for OpenAI.
3. **Supabase** (free): create a project, open *SQL Editor*, run [`supabase/schema.sql`](supabase/schema.sql).
   An existing project runs the files in [`supabase/migrations/`](supabase/migrations) it hasn't run yet, in order.
   For quick testing, turn off *Authentication → Sign In / Providers → Email → Confirm email*.
4. Copy `.env.example` to `.env.local` and fill in the keys, then:

```bash
npm install
npm run dev
```

Self-check of the pure pipeline logic (header removal, query understanding, fusion, context
builder, CSV parsing, claim parsing, benchmark metrics):

```bash
node --experimental-strip-types scripts/check-rag.mts
```

## Free-tier limits worth knowing

- OpenRouter free models are capped at 50 requests a day (1,000 once you have bought $10 of credit) and 20 a minute;
  the paid Qwen fallback takes over when they run out. Each question uses 2–4 calls (answer, claim check,
  entity memory, sometimes a rewrite). Set `VERIFY_ANSWERS=false` to drop the claim check. Free model ids
  also get retired; pick a current one from https://openrouter.ai/models?max_price=0 for `CHAT_MODEL`.
- Chat is limited to 10 questions per user per minute to protect that quota.
- Uploads go straight to Supabase Storage (50 MB per file); processing runs in steps of under 60 s, so it
  fits Vercel Hobby. Scanned PDF pages are OCR-ed with a free vision model (`OCR_MODEL`), one call per page,
  about 3 pages per processing step; a 14-page scan takes 1 to 2 minutes and uses 14 calls of the daily quota.
- Supabase free projects pause after a week of inactivity.

## Deploy on Vercel (free Hobby plan)

1. Push the repo to GitHub, then on vercel.com: *Add New → Project → Import* the repo.
2. Add every variable from `.env.example` under *Environment Variables*, then *Deploy*.
3. In Supabase *Authentication → URL Configuration*, set *Site URL* to your Vercel URL.
