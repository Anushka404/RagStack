# 📄 AskPDF Bot

An intelligent **AI-powered PDF assistant** that allows users to upload any document and **ask contextual questions** about its content — powered by **Gemini or OpenAI embeddings**, **Next.js**, and **Pinecone** vector search.

> 🚀 A fully-functional **RAG (Retrieval-Augmented Generation)** app built using **Next.js**, **Gemini / OpenAI**, and **Pinecone**, designed to deliver accurate, document-grounded answers.

---

## ✨ Features

- 🧠 **RAG-based question answering** — retrieves the most relevant document chunks using embeddings.  
- 📤 **Upload PDFs easily** — drag-and-drop or select files.  
- ⚡ **Fast & contextual responses** using Gemini (free tier) or OpenAI embeddings + chat models.  
- 🗂️ **Chunked document indexing** for scalable semantic search.  
- 🪄 **Clean chat-style interface** built with Tailwind CSS.  
- 🔐 **Secure API routes** using environment variables and rate-limited endpoints.

---

## 🧱 Tech Stack

| Category | Technologies |
|-----------|---------------|
| **Frontend** | Next.js, React.js, Tailwind CSS |
| **Backend** | Node.js (Next.js API Routes), Supabase (auth + Postgres) |
| **AI** | Gemini (free) or OpenAI — embeddings + chat, via LangChain |
| **Vector DB** | Pinecone |
| **File Parsing** | pdf-parse / pdfjs |
| **Deployment** | Vercel |

---

## ⚙️ Setup (all free tiers)

1. **OpenRouter API key** (free models): https://openrouter.ai/keys, with `LLM_PROVIDER=openrouter`.
   Embeddings then use Pinecone's free `llama-text-embed-v2` with your Pinecone key.
   _Alternatives: `LLM_PROVIDER=gemini` + `GOOGLE_API_KEY` (free tier), or `openai` + `OPENAI_API_KEY` (paid credits)._
2. **Pinecone** (free Starter): create a serverless index (Custom settings, dense, metric `cosine`)
   with dimension `1024` for Pinecone embeddings, `3072` for Gemini or `1536` for OpenAI.
3. **Supabase** (free): create a project, open *SQL Editor*, run [`supabase/schema.sql`](supabase/schema.sql).
   For quick testing, turn off *Authentication → Sign In / Providers → Email → Confirm email*.
4. Copy `.env.example` to `.env.local` and fill in the keys, then:

```bash
npm install
npm run dev
```

## 🚀 Deploy on Vercel (free Hobby plan)

1. Push the repo to GitHub, then on vercel.com: *Add New → Project → Import* the repo.
2. Add every variable from `.env.example` under *Environment Variables*, then *Deploy*.
3. In Supabase *Authentication → URL Configuration*, set *Site URL* to your Vercel URL.

Limits: Vercel caps uploads at ~4.5 MB per request and functions at 60 s on Hobby,
so very large PDFs need splitting. Supabase free projects pause after a week of inactivity.
