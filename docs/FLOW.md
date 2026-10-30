# RAGStack: architecture and flows

How the parts of RAGStack fit together, how a document becomes searchable, and how a question becomes
an answer. Diagrams are Mermaid: they render on GitHub, in VS Code (with a Mermaid extension) and at
[mermaid.live](https://mermaid.live), where they can also be exported as images for slides.
For the presentation script, see [PRESENTATION_GUIDE.md](PRESENTATION_GUIDE.md).

---

## 1. System architecture

```mermaid
flowchart LR
  subgraph Browser["Browser · Next.js pages"]
    LP["Login"]
    KB["Knowledge base<br/>tree · upload dialog"]
    CH["Chat<br/>filters · trace panel"]
  end

  subgraph Server["Next.js API routes · Node.js"]
    DOCAPI["/api/documents<br/>register an upload"]
    PROC["/api/documents/id/process<br/>one ingestion step"]
    CHAT["/api/chat<br/>retrieve and answer"]
    THR["/api/threads<br/>chats and documents"]
  end

  subgraph Supabase["Supabase"]
    AUTH["Auth<br/>accounts and sessions"]
    STO["Storage<br/>private file per user"]
    PG["Postgres<br/>documents · chunks · chats<br/>+ full-text keyword index"]
  end

  subgraph Pinecone["Pinecone"]
    EMB["Embedding model<br/>llama-text-embed-v2"]
    VEC["Vector index<br/>one namespace per user"]
    RR["Reranker<br/>bge-reranker-v2-m3"]
  end

  subgraph OpenRouter["OpenRouter"]
    LLM["Nemotron VL, free<br/>fallback: Qwen 3.7 Flash"]
  end

  LP --> AUTH
  KB -->|file| STO
  KB --> DOCAPI --> PG
  KB --> PROC
  PROC --> STO
  PROC -->|OCR of scanned pages| LLM
  PROC --> EMB
  PROC --> VEC
  PROC --> PG
  CH --> CHAT
  CHAT --> EMB
  CHAT -->|semantic search| VEC
  CHAT -->|keyword search| PG
  CHAT --> RR
  CHAT -->|context + question| LLM
  CH --> THR --> PG
```

| Part | Role |
|---|---|
| **Browser** | The three pages the user sees. Files are uploaded straight to Supabase Storage, not through the server |
| **Next.js API routes** | The backend: check the login, run ingestion steps, run retrieval and call the LLM |
| **Supabase** | Accounts, the database (documents, chunk text, chats, traces), private file storage, and keyword search |
| **Pinecone** | Turns text into vectors, stores them per user, and reranks search candidates |
| **OpenRouter** | One API for many LLMs: the free model reads scanned pages and writes answers; the paid fallback steps in when it is busy |

---

## 2. The synopsis layers

```mermaid
flowchart TB
  D["Data sources<br/>PDF · DOCX · TXT · Markdown · CSV · scanned notes"]
  L1["Layer 1 · Universal ingestion<br/>text extraction · OCR · header and footer removal"]
  L2["Layer 2 · Multi-representation indexing<br/>chunks + metadata · vectors in Pinecone · keyword index in Postgres"]
  L3["Layer 3 · Context engineering and retrieval<br/>filters · hybrid search · rank fusion · reranking · context builder"]
  L4["Layer 4 · Generation and verification<br/>grounded answer · sources · stage 3: citations and claim check"]
  U["User gets a sourced answer"]
  D --> L1 --> L2 --> L3 --> L4 --> U
```

---

## 3. Ingestion: from upload to searchable

```mermaid
flowchart TD
  A["User picks a file, collection, year and tags"] --> B["POST /api/documents<br/>creates the document row, status uploading"]
  B --> C["Browser uploads the file to Supabase Storage"]
  C --> D["POST /api/documents/id/process<br/>called repeatedly, each call under 60 s"]
  D --> E["Download the file and read text page by page"]
  E --> F{"Page has fewer than 8 distinct words?"}
  F -->|yes, a scan or watermark| G["Take the page image and OCR it with the vision LLM<br/>3 pages at a time, text saved per page"]
  G --> H{"All scanned pages read?"}
  H -->|no| D
  H -->|yes| I["Remove repeated headers and footers"]
  F -->|no| I
  I --> J["Split into chunks of about 1000 characters, 150 overlap"]
  J --> K["Attach metadata: collection · year · tags · page · file"]
  K --> L["Embed in batches of 96 with llama-text-embed-v2"]
  L --> M["Vectors to Pinecone, chunk text to Postgres"]
  M --> N{"All chunks stored?"}
  N -->|no, time budget used| D
  N -->|yes| O["Status ready"]
```

**Why steps?** A serverless request may run for at most 60 seconds, so a big file is processed over many
short calls. Everything is resumable: OCR text is saved per page and chunk ids are fixed, so a repeated
step never duplicates work. A page whose OCR loops or stalls is re-read by the fallback model.

---

## 4. Answering a question (stage 2)

```mermaid
flowchart TD
  Q["User question + chosen filters"] --> P["Prepare<br/>load chat memory, rewrite he / she / they"]
  P --> U["Read the question<br/>spot years and collection names that exist"]
  U --> Y{"Two or more years?"}
  Y -->|no| S["One search"]
  Y -->|yes| S2["One search per year"]
  S --> SEM
  S --> KW
  S2 --> SEM
  S2 --> KW
  SEM["Semantic search<br/>Pinecone, top 20 by meaning"] --> RRF
  KW["Keyword search<br/>Postgres full-text, top 20 by words"] --> RRF
  RRF["Reciprocal rank fusion<br/>merge the two ranked lists"] --> RR["Rerank<br/>cross-encoder scores the top 20, keeps 6"]
  RR --> CB["Context builder<br/>drop near-duplicates · about 3000-token budget · order by page"]
  CB --> LLM["LLM answers only from the context<br/>streamed to the browser"]
  LLM --> OUT["Answer + source chips + trace panel"]
  OUT --> SAVE["Saved with the chat"]
```

Stage 3 adds two steps after the answer: numbered `[n]` citations in the text, and a second LLM pass
that checks every claim against the passages.

---

## 5. One chat request, step by step

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Chat API
  participant SB as Supabase
  participant PC as Pinecone
  participant LM as OpenRouter LLM
  B->>A: question and filters
  A->>SB: check login, load chat memory, save the question
  A->>PC: embed the question, semantic search in the user's namespace
  A->>SB: keyword search over the user's chunks
  A->>PC: rerank the fused candidates
  A->>LM: context and question
  LM-->>A: answer, streamed
  A-->>B: answer text, then sources and trace
  A->>SB: save the answer with its trace
```

---

## 6. Data model

```mermaid
erDiagram
  DOCUMENTS ||--o{ CHUNKS : "split into"
  DOCUMENTS |o--o{ THREADS : "uploaded in"
  THREADS ||--o{ MESSAGES : contains
  THREADS ||--o{ THREAD_ENTITIES : remembers
  DOCUMENTS {
    uuid id
    text file_name
    text collection
    int year
    text_array tags
    text status
    jsonb stats
    jsonb ocr_pages
  }
  CHUNKS {
    text id "same id as the Pinecone vector"
    int chunk_index
    int page_number
    text content
    tsvector fts "keyword index"
  }
  THREADS {
    text id
    text title
  }
  MESSAGES {
    text role
    text content
    text sources
    jsonb trace
  }
  THREAD_ENTITIES {
    text entity "person or organisation for follow-ups"
  }
```

Every table also has a `user_id`, and row-level security lets each user see only their own rows.
In Pinecone, each chunk is a vector of 1024 numbers stored under the user's own namespace, with
metadata (document id, file name, page, collection, year, tags) used for filtering.

---

## 7. What each stage shows

| Feature | Stage 1 | Stage 2 | Stage 3 |
|---|:-:|:-:|:-:|
| Upload with steps, OCR, header removal, chunking, embedding | ✅ | ✅ | ✅ |
| Knowledge base tree with metadata | ✅ | ✅ | ✅ |
| Semantic search, grounded answers, source chips, "not found" refusal | ✅ | ✅ | ✅ |
| Chat memory and follow-up rewriting | ✅ | ✅ | ✅ |
| Basic trace (query, similarity-ranked chunks, timings) | ✅ | ✅ | ✅ |
| Filters by collection, year, document ("Ask about this in chat") | | ✅ | ✅ |
| Keyword search + reciprocal rank fusion | | ✅ | ✅ |
| Reranking | | ✅ | ✅ |
| Year detection and per-year comparison searches | | ✅ | ✅ |
| Full trace (S/K ranks, rerank scores, searches) | | ✅ | ✅ |
| Inline `[n]` citations | | | ✅ |
| Claim-by-claim answer check | | | ✅ |
| Evaluation page | | | ✅ |

Set with `NEXT_PUBLIC_DEMO_STAGE` in `.env.local` (currently 2), then restart the dev server.

---

## 8. Where each box lives in the code

| Box | File |
|---|---|
| Upload dialog and its steps | `components/upload/UploadDialog.tsx` |
| Knowledge base page and tree | `app/knowledge/page.tsx`, `components/knowledge/NodeDetail.tsx` |
| Chat page, filters, trace panel | `app/page.tsx`, `components/chat/ChatShell.tsx`, `components/chat/TraceDetails.tsx` |
| Ingestion steps | `lib/rag/ingest.ts`, `app/api/documents/[id]/process/route.ts` |
| Reading PDFs and page images | `lib/pdf/pdfjs.ts`, `lib/pdf/loader.ts` |
| OCR | `lib/pdf/ocr.ts` |
| Header/footer removal, scan detection | `lib/pdf/parse.ts` |
| Chunking and metadata | `lib/rag/chunking.ts`, `lib/rag/metadata.ts` |
| Embeddings and Pinecone | `lib/ai/embeddings.ts`, `lib/pinecone/vector-store.ts` |
| Query understanding | `lib/rag/query-understanding.ts` |
| Semantic search and filters | `lib/rag/retrieve.ts` |
| Keyword search | `lib/db/chunks.ts`, `search_chunks_keyword` in `supabase/schema.sql` |
| Rank fusion, reranking, orchestration | `lib/rag/fusion.ts`, `lib/rag/rerank.ts`, `lib/rag/hybrid.ts` |
| Context builder | `lib/rag/context.ts` |
| Answer generation and prompts | `lib/rag/answer.ts`, `lib/ai/prompts.ts`, `lib/ai/model.ts` |
| Chat API | `app/api/chat/route.ts` |
| Stage switch | `lib/stage.ts` |
