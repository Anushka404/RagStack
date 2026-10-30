# RAGStack: presentation guide (stage 2)

How to present the project at **stage 2**, what every page and component is, and a demo script whose
questions and answers were tested on 30 October 2026. For diagrams of how it all fits together, see
[FLOW.md](FLOW.md).

---

## 1. The story in one minute

**Problem.** An LLM doesn't know an organisation's own documents, can't read a whole archive at once,
and makes things up when the evidence is missing. Retraining it for every new document is expensive.

**RAGStack** is a *context-engineering layer*: it keeps the knowledge outside the model, in searchable
indexes, and for each question hands the LLM only the few passages that answer it, with their sources.
The same base model then behaves like a domain expert, and new documents only need indexing, not training.

**What you'll show.** Upload any document (even handwritten scanned notes) and watch it get indexed;
browse how it's stored; then ask questions and open the trace to show *how* the right passages were
found: filters, semantic plus keyword search, reranking, and year-aware comparisons.

---

## 2. What stage 2 covers in your synopsis

| Synopsis layer | Stage 2 status | Where you see it |
|---|---|---|
| **1. Universal ingestion** | ✅ PDF, DOCX, TXT, Markdown, CSV; OCR of scanned and handwritten pages; header/footer removal | Upload dialog, steps 1 to 3 |
| **2. Multi-representation indexing** | ✅ Chunks with metadata, vectors in Pinecone, keyword index in Postgres | Upload steps 4 to 6; Knowledge base tree |
| **3. Context engineering and retrieval** | ✅ Namespace filters, hybrid semantic + keyword search, rank fusion, reranking, year detection, context builder | Filter dropdowns; "How this answer was found" |
| **4. Generation and verification** | 🟡 Grounded answers with sources and "not found" refusals. Citations and the claim check come in stage 3 | The answer and its source chips |
| **Evaluation** | ⏳ Stage 3 | Hidden |

---

## 3. Page by page

### Login
Supabase handles accounts. Every user's data is separate: database rows are protected by row-level
security, files sit in a private folder per user, and each user has their own Pinecone namespace.

### Knowledge base (open this first)
- **Top cards:** collections, documents, chunks, vectors in Pinecone, and the embedding size (1024 numbers per chunk).
- **The tree:** Collection → Year → Document → Page → Chunk. This mirrors exactly how retrieval can be
  narrowed. Click any level to see its metadata; a chunk shows its full text, vector id and size.
- **"Ask about this in chat"** (on a collection, year or document) opens a chat already filtered to it.
- **Upload document** opens the upload dialog. Pick a file, a collection, an optional year and tags. Each step is real:

| Step | What actually happens |
|---|---|
| Upload to storage | The file goes straight to Supabase Storage, into a private folder for this user |
| Extract text | pdf.js reads each page. Pages with almost no text (scans, or only a watermark) go to a vision model that reads the image: free Nemotron VL first, Qwen 3.7 Flash as a cheap fallback |
| Clean text | Lines that repeat at the top or bottom of most pages (headers, footers, branding) are removed. The Renewable Energy notes lost 259 such lines |
| Chunk | Text is split into ~1000-character pieces with 150 characters of overlap, never across pages |
| Attach metadata | Each chunk gets the collection, year, tags, page number and file name |
| Embed and index | Pinecone's `llama-text-embed-v2` turns each chunk into a 1024-number vector, stored in Pinecone; the chunk text also goes into Postgres, which keeps a keyword (full-text) index of it |
| Ready | The document can be searched in chat |

Big files are processed in short steps (under 60 seconds each), so a 278-page PDF or a 101-page scan
finishes in the background, and an interrupted upload resumes where it stopped.

### Chat
- **Sidebar:** New chat, Recent chats (named after their first question), your documents and their status,
  Upload, and storage stats.
- **Filter dropdowns** (top right): search only one collection, year or document. This is the synopsis's
  *namespace router*.
- **The answer** comes only from your documents, naming the page it used. If they don't contain the
  answer, the app says "I couldn't find that in the uploaded document." instead of inventing something.
- **Source chips** under the answer show the files and pages that were given to the model.
- **"How this answer was found"** (click to open), row by row:

| Row | Meaning |
|---|---|
| Searched for | The query actually searched (follow-ups like "his salary" are rewritten to name the person) |
| Read from question | Years or a collection name spotted in the question; two years mean "one search per year" |
| Filters | Which part of the knowledge base was searched (chosen in the dropdowns or read from the question) |
| Searches | How many hits semantic search and keyword search each returned |
| Reranker | The model that re-scored the candidates (`bge-reranker-v2-m3`) |
| Context sent | How much text went to the LLM, in tokens: the "context budget" |
| Answered by | The LLM that wrote the answer |
| Chunk list | The passages used, best first. `[n]` is its position in the context, **S** its semantic rank, **K** its keyword rank, and the number is the reranker's relevance score (0 to 1). Greyed rows were left out (near-duplicate or over budget) |
| Time per stage | prepare, search, rerank, generate |

---

## 4. What happens when you ask a question (stage 2)

1. **Prepare:** load the chat's recent messages; rewrite "he / she / they" questions to name the person.
2. **Read the question:** spot years and collection names that exist in your documents and turn them into filters.
3. **Search, twice in parallel:** semantic search in Pinecone (meaning) and keyword search in Postgres
   (exact words, IDs, dates). A question naming two years runs this once per year.
4. **Fuse:** merge the two ranked lists with reciprocal rank fusion (chunks found by both rise to the top).
5. **Rerank:** a cross-encoder reads the question and each candidate together and scores relevance; the best 6 go on.
6. **Build the context:** drop near-duplicates (e.g. a page scanned twice), keep within the budget, order by document and page.
7. **Generate:** send context + question to the LLM with strict "answer only from this" rules; stream the answer back.
8. **Save:** store the answer, its sources and the trace with the chat.

## 5. Tech stack and models

- **Next.js + React + Tailwind:** the web app and its API routes
- **Supabase:** login, Postgres database (documents, chunks, chats), file storage, full-text keyword search
- **Pinecone:** vector database, plus its free hosted embedding model and reranker
- **OpenRouter:** one API for many LLMs; we use free Nemotron VL with Qwen 3.7 Flash as a fallback
- **LangChain:** plumbing between the app and the models

| Job | Model | Key settings |
|---|---|---|
| Writing answers | Nemotron 3.5 Super VL (free), fallback Qwen 3.7 Flash | temperature 0.4, thinking off, streamed |
| OCR of scanned pages | Same two (both read images) | 3 pages at a time, 40 s and 2,048-token limit per page, looping reads redone on Qwen |
| Follow-up rewriting, chat memory | Same two | temperature 0.2 |
| Embeddings | `llama-text-embed-v2` (Pinecone) | 1024 numbers per chunk, cosine similarity |
| Reranking | `bge-reranker-v2-m3` (Pinecone) | top 20 in, best 6 out |
| Keyword search | Postgres full-text search | terms OR-ed, ranked by `ts_rank_cd` |

**The key numbers to remember:** chunks of 1,000 characters with 150 overlap; 20 candidates from each
search; fusion score 1/(60 + rank); 6 chunks kept after reranking; a context budget of about 3,000 tokens;
a page counts as scanned below 8 distinct words.

**Why these models:** in our tests Tesseract couldn't read cursive (30/100); free Nemotron with thinking
off read a handwritten page in 2.3 s; of the paid models, Qwen was the most faithful, DeepSeek invented a
note and Gemini shifted a table column. [FLOW.md](FLOW.md) explains every step's logic in detail.

---

## 6. Showing the project in stages

The app has a switch, `NEXT_PUBLIC_DEMO_STAGE` in `.env.local` (restart `npm run dev` after changing it).
It is currently set to **2**.

| Stage | Shows | Review |
|---|---|---|
| 1 | Ingestion, Knowledge base, plain semantic chat with sources | Skipped |
| **2** | + filters, hybrid search, reranking, year detection, full trace | **Tomorrow** |
| 3 | + inline citations, claim-by-claim check, Evaluation page | Final review |

---

## 7. Demo script (about 10 minutes)

**Before you start:** the knowledge base already holds four collections:
- *Tsunami archive*: two sample annual reports (2026, 2027) **we generated for the demo; the figures are
  made up**. Present them as sample reports. The files are in [`docs/demo-files/`](demo-files/).
- *Cloud Computing*: 126 pages, 101 of them handwritten scans with a watermark, all read by OCR
- *Renewable Energy*: 278 pages, 280 chunks
- *PPS notes*: 14 handwritten pages, read by OCR

1. **Login** (15 s). One line on per-user data isolation.
2. **Knowledge base** (2 min). Open *Tsunami archive* → 2026 → the report → a page → a chunk: show the
   text and metadata. Then show *Cloud Computing* and say 101 handwritten pages were read by OCR.
3. **Live upload** (2 min). Upload a *small* PDF (2 to 5 pages) and narrate each step as it ticks.
   Don't upload the 30 MB file live: its OCR takes about 5 minutes.
4. **Chat** (5 min). Ask these in a new chat (all tested on 30 October; your wording can differ slightly):

| # | Question | Filter | Expected answer | What to point at in the trace |
|---|---|---|---|---|
| 1 | Compare the peak wave height and the average warning lead time in 2026 and 2027. | none | 2026: 3.2 m, 11 min. 2027: 4.1 m, 8 min | "Read from question: years 2026, 2027 → one search per year"; sources from both reports. **This is the tsunami example from your synopsis.** |
| 2 | What happened during event PT-2027-0219? | none | 19 Feb 2027, near the Kuril Islands, 4.1 m, the largest event of 2027 | Only one keyword hit (K1) for the exact ID, and the year 2027 read from inside the ID |
| 3 | What are the building blocks of SOAP? | Collection: Cloud Computing | Envelope, Header, Body, Fault (page 46, handwritten) | "Filters: collection = Cloud Computing"; page 46 has S1 K1 and reranker score 1.000 |
| 4 | What is the solar constant and what is its value? | none | Solar energy per second on 1 m² just outside the atmosphere, about 1361 W/m² (page 65) | A 278-page book, and the right page is first |
| 5 | Who is the CEO of the company? | none | "I couldn't find that in the uploaded document." | Every reranker score is about 0.000, so nothing relevant exists, and the model refuses instead of inventing |

   Also click **"Ask about this in chat"** on a collection in the Knowledge base to show a pre-filtered chat.

5. **Roadmap** (1 min). Show what comes next (section 10).

---

## 8. Likely questions

- **Why not fine-tune the model?** Fine-tuning changes the model's weights and must be redone for every
  new document; RAGStack keeps knowledge outside the model, so adding a document is just indexing it.
- **What is an embedding / vector?** A list of 1024 numbers that captures a chunk's meaning; chunks with
  similar meaning have similar vectors, so the closest vectors to the question are the most relevant chunks.
- **Why both semantic and keyword search?** Semantic search finds meaning ("lead time" ≈ "warning time")
  but can miss exact codes, IDs and rare terms; keyword search finds those exactly (question 2). Together
  they cover both.
- **What is reciprocal rank fusion?** A way to merge two ranked lists using only positions: each chunk
  scores 1/(60 + rank) in each list, and the scores add up, so a chunk ranked well by both wins.
- **What does the reranker do?** The first searches compare the question and the chunk separately. The
  reranker (a cross-encoder) reads the question and each candidate *together* and scores how well it
  answers, which is sharper, so it reorders the top 20 and keeps the best 6.
- **How does it compare two years?** It spots the years in the question, checks they exist in the
  documents, and runs a separate search per year so each side gets its own evidence.
- **What is the namespace router?** The filters: every chunk carries its collection, year and document,
  so a search can be restricted to one part of the knowledge base instead of everything.
- **Why split into chunks?** The LLM can only read a limited amount at once, and smaller pieces let us
  send just the relevant parts. 150 characters of overlap keeps sentences at the boundaries intact.
- **How do you read handwritten notes?** A vision LLM transcribes each scanned page. We compared it with
  Tesseract (classic OCR), which scored 30/100 on cursive and produced garbage.
- **What if the model hallucinates?** It is told to answer only from the given passages and to say when
  they don't contain the answer (question 5); sources are always shown. Stage 3 adds an automatic claim check.
- **Is the data private?** Each user's files, rows and vectors are isolated (row-level security, private
  storage folder, own Pinecone namespace).
- **What does it cost?** Free tiers for everything; the paid fallback model costs about $0.0001 a call.
  All model testing and big-file ingestion on 30 October cost $0.003 in total.
- **How big a file can it handle?** Tested with a 278-page PDF (ready in about a minute) and a 31 MB,
  126-page scanned PDF (about 5 minutes, mostly OCR). Files up to 50 MB.

## 9. If something goes wrong

- **An answer says "Error: … free-models-per-day":** the free daily limit is used up; the Qwen fallback
  normally covers it. Check the OpenRouter balance.
- **The first question is slow:** the dev server compiles each page on first use. Warm up before presenting.
- **The comparison answers only one year:** check both tsunami reports are "ready" and have years 2026 and 2027.
- **Login fails:** Supabase free projects pause after a week of inactivity; open the Supabase dashboard
  the day before to wake it.

## 10. Roadmap: what to show as next steps

Stage 3 (built, revealed at the final review):
- Inline [n] citations in every answer, each linked to its passage
- A claim-by-claim check of every answer against its sources
- An evaluation dashboard: response times, share of supported claims, and a retrieval benchmark

Real work still to do (good material for the later reviews):
- **Organisation features:** workspaces or departments, shared collections, roles (admin / member)
- **More sources:** import from Google Drive or a web page
- **Management:** edit a document's metadata, re-index it, delete or export chats
- **Deployment:** host on Vercel with a public link
- **Evaluation for the report:** a 20 to 50 question test set and a results table comparing models and modes
- **OCR:** Hindi and mixed-language notes, better table extraction

## 11. Checklist for the morning

- [ ] `.env.local` has `NEXT_PUBLIC_DEMO_STAGE=2` (already set), then `npm run dev`
- [ ] Sign in, open the Knowledge base, check all four collections show "ready"
- [ ] Ask one warm-up question (the first request is slow)
- [ ] OpenRouter balance above $1
- [ ] A small PDF ready on the desktop for the live upload
- [ ] Screenshots or a screen recording as a backup if the internet fails
