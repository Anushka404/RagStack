import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

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

    // Save uploaded file to temp path
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPdfPath = path.join(os.tmpdir(), `upload-${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);

    // Parse PDF with LangChain PDFLoader
    const loader = new PDFLoader(tempPdfPath);
    const docs = await loader.load();

    const fullText = docs.map(doc => doc.pageContent).join("\n");

    if (!fullText.trim()) {
      throw new Error("No text content extracted from PDF.");
    }

    const prompt = `
    You are an intelligent document parser. Your job is to extract structured, accurate JSON objects from reports.
    
    Return a JSON array of objects. Each object must follow this exact format:
    {
      "id": "doc_chunk_<n>",
      "metadata": {
        "section": "<title of the section>",
        "description": "<short summary of what the section talks about>",
        "people": ["<name 1>", "<name 2>", "..."],
        "places": ["<place 1>", "<place 2>", "..."],
        "dates": ["<date 1>", "<date 2>", "..."],
        "times": ["<time 1>", "<time 2>", "..."]
      },
      "text": "<verbatim full content of this section, including ALL numerical, statistical, and personal information without skipping or summarizing>"
    }
    
    IMPORTANT:
    - The "text" field must include ALL content from the original section. Nothing should be skipped.
    - Ensure all names, places, dates, times, and numerical/statistical data are preserved as-is.
    - If the section mentions a person (e.g. 'Mr. Rajeev Kumar', 'Anjali Sharma'), list their names in the metadata under "people".
    - Do not omit smaller details — every sentence must be captured in the text field.
    - Do NOT return any markdown, explanation, or commentary. Only output a raw JSON array of objects.
    
    Your goal is to preserve the entire report accurately so that if we later combine all \`text\` fields from the array, it should reconstruct the entire PDF content exactly.
    
    Here is the document:
    """
    ${fullText}
    """
    `;
    
    

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "You extract structured data from text documents." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });
    
    // ✅ Log raw response from GPT
    const rawContent = gptResponse.choices[0].message?.content || "";
    console.log("GPT Raw Response:\n", rawContent);
    
    // ✅ Attempt to wrap in brackets if needed
    let structuredText = rawContent.trim();
    if (!structuredText.startsWith("[")) {
      structuredText = `[${structuredText}]`;
    }
    
    let chunks;
    try {
      chunks = JSON.parse(structuredText);
      if (!Array.isArray(chunks)) throw new Error("Expected an array of chunk objects.");
    } catch (e) {
      console.error("❌ Failed to parse GPT JSON:\n", structuredText);
      throw new Error("Invalid JSON structure from GPT.");
    }
    
    for (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: chunk.text,
      });
      console.log(`✅ Embedding created for: ${chunk.id}`);

      await pineconeIndex.upsert([
        {
          id: chunk.id || `chunk_${Date.now()}_${Math.random()}`,
          values: embedding.data[0].embedding,
          metadata: {
            ...chunk.metadata,
            text: chunk.text,
          },
        },
      ]);
      console.log(`📦 Data pushed to Pinecone: ${chunk.id}`);
    }

    return NextResponse.json({ success: true, chunksUploaded: chunks.length });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload and parse document." }, { status: 500 });
  }
}
