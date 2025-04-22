import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const pineconeIndex = pinecone.index("knowledge-base");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Invalid or missing PDF file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPdfPath = path.join(os.tmpdir(), `upload-${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);

    const fileHash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 6);

    const loader = new PDFLoader(tempPdfPath);
    const docs = await loader.load();
    const fullText = docs.map(doc => doc.pageContent).join("\n");

    if (!fullText.trim()) throw new Error("No text content extracted from PDF.");

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.createDocuments([fullText]);
    let uploadedCount = 0;

    for (let i = 0; i < splitDocs.length; i++) {
      const chunkText = splitDocs[i].pageContent;
      const chunkId = `chunk_${fileHash}_${i}`;

      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: chunkText,
      });

      await pineconeIndex.upsert([
        {
          id: chunkId,
          values: embedding.data[0].embedding,
          metadata: {
            text: chunkText,
            source: file.name || "uploaded_pdf",
          },
        },
      ]);

      console.log(`✅ Embedded and uploaded chunk: ${chunkId}`);
      uploadedCount++;
    }

    return NextResponse.json({ success: true, chunksUploaded: uploadedCount });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload and parse document." }, { status: 500 });
  }
}
