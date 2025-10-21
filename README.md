# 📄 AskPDF Bot

An intelligent **AI-powered PDF assistant** that allows users to upload any document and **ask contextual questions** about its content — powered by **OpenAI embeddings**, **Next.js**, and **Pinecone** vector search.

> 🚀 A fully-functional **RAG (Retrieval-Augmented Generation)** app built using **Next.js**, **OpenAI**, and **Pinecone**, designed to deliver accurate, document-grounded answers.

---

## 🌐 Live Demo

🔗 [https://2-way-rag.vercel.app/](https://2-way-rag.vercel.app/)

---

## ✨ Features

- 🧠 **RAG-based question answering** — retrieves the most relevant document chunks using embeddings.  
- 📤 **Upload PDFs easily** — drag-and-drop or select files.  
- ⚡ **Fast & contextual responses** using OpenAI’s Ada-002 embeddings + GPT API.  
- 🗂️ **Chunked document indexing** for scalable semantic search.  
- 🪄 **Clean chat-style interface** built with Tailwind CSS.  
- 🔐 **Secure API routes** using environment variables and rate-limited endpoints.

---

## 🧱 Tech Stack

| Category | Technologies |
|-----------|---------------|
| **Frontend** | Next.js, React.js, Tailwind CSS |
| **Backend** | Node.js (Next.js API Routes) |
| **AI** | OpenAI Embeddings + Chat Completion APIs |
| **Vector DB** | Pinecone |
| **File Parsing** | pdf-parse / pdfjs |
| **Deployment** | Vercel |

---

## ⚙️ Installation

```bash
# Clone the repository
git clone https://github.com/Anant-404/AskPDF.git

# Navigate to the project folder
cd AskPDF

# Install dependencies
npm install

# Create an environment file
cp .env.example .env.local
