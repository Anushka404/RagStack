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
    let allChunks: any[] = [];
    const allPeople = new Set<string>();

    for (let i = 0; i < splitDocs.length; i++) {
      const chunkText = splitDocs[i].pageContent;

      const prompt = `
You are a highly accurate document parser. Your task is to extract *every detail* from the document text below and return a strict JSON array of objects.

Each object must follow this format:
{
  "metadata": {
    "section": "<title of the section>",
    "description": "<summary of what the section discusses>",
    "people": ["<name 1>", "<name 2>", "..."],
    "places": ["<place 1>", "<place 2>", "..."],
    "dates": ["<date 1>", "<date 2>", "..."],
    "times": ["<time 1>", "<time 2>", "..."],
    "social_handles": ["@handle1", "YouTube:FasBeam", "Instagram:@fasbeam", "..."]
  },
  "text": "<complete verbatim content from this section>"
}

Important instructions:
- NEVER skip or summarize. Include all numbers, names, locations, and statements word-for-word in the 'text' field.
- Extract **all** social media handles, brand names, and usernames, including YouTube channels and X/Twitter handles.
- If the text includes Instagram, YouTube, or Twitter/X presence, extract both platform and handle (e.g., Instagram:@fasbeam).
- Your output must be a valid JSON array only — no commentary, no markdown.
- Output format must strictly match the format above.

Here is the document:
"""
${chunkText}
"""
      `.trim();
console.log(chunkText);
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You extract structured JSON data from raw document text. Return only a valid JSON array." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      });

      let gptRaw = gptResponse.choices[0].message?.content?.trim() || "";
      console.log(" Raw GPT Output (start):", gptRaw.slice(0, 400));

      if (gptRaw.startsWith("```json") || gptRaw.startsWith("```")) {
        gptRaw = gptRaw.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      if (!gptRaw.startsWith("[") && gptRaw.startsWith("{") && gptRaw.endsWith("}")) {
        gptRaw = `[${gptRaw}]`;
      }

      gptRaw = gptRaw
        .replace(/(?<!\\)\n/g, " ")
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");

      let parsedChunks;
      try {
        parsedChunks = JSON.parse(gptRaw);
        if (!Array.isArray(parsedChunks)) throw new Error("Expected a JSON array.");
      } catch (err) {
        console.error(" JSON parse error from GPT chunk:", gptRaw);
        throw new Error("Failed to parse JSON from GPT.");
      }

      for (let j = 0; j < parsedChunks.length; j++) {
        const chunk = parsedChunks[j];
        const uniqueId = `chunk_${fileHash}_${i}_${j}`;

        // collect people globally
        // if (chunk.metadata?.people?.length) {
        //   for (const person of chunk.metadata.people) {
        //     allPeople.add(person);
        //   }
        // }

        const embedding = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: chunk.text,
        });

        await pineconeIndex.upsert([
          {
            id: uniqueId,
            values: embedding.data[0].embedding,
            metadata: {
              ...chunk.metadata,
              text: chunk.text,
              source: file.name || "uploaded_pdf",
            },
          },
        ]);

        console.log(`✅ Stored chunk: ${uniqueId}`);
      }

      allChunks.push(...parsedChunks);
    }

    // Add global people summary chunk
    const peopleList = [...allPeople];
    if (peopleList.length) {
      const summaryText = `This document contains data about the following people: ${peopleList.join(", ")}.`;
      const summaryEmbedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: summaryText,
      });

      await pineconeIndex.upsert([
        {
          id: `global_people_${fileHash}`,
          values: summaryEmbedding.data[0].embedding,
          metadata: {
            type: "people_summary",
            // people: peopleList,
            text: summaryText,
            source: file.name || "uploaded_pdf",
          },
        },
      ]);

      console.log(" Stored global people summary chunk.");
    }

    return NextResponse.json({ success: true, chunksUploaded: allChunks.length + 1 });
  } catch (err: any) {
    console.error(" Upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload and parse document." }, { status: 500 });
  }
}
