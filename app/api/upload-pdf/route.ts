import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { ingestPDF } from "@/lib/rag/ingest";
import { setLastDocumentRef } from "@/lib/rag/memory";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveDocument } from "@/lib/db/documents";
import { updateThreadDocument, ensureThread } from "@/lib/db/threads";
import { getIndexStats } from "@/lib/pinecone/vector-store";

export async function POST(req: NextRequest) {
  let tempPdfPath: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const threadId = (formData.get("threadId") as string) || null;

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Invalid or missing PDF file" }, { status: 400 });
    }

    // Write to temp file
    const buffer = Buffer.from(await file.arrayBuffer());
    tempPdfPath = path.join(os.tmpdir(), `upload-${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);

    // Run ingestion — scoped to user's Pinecone namespace
    const result = await ingestPDF(tempPdfPath, file.name, user.id);

    // Store in memory
    if (threadId) setLastDocumentRef(threadId, result.fileName);

    // Save to Supabase
    const doc = await saveDocument(supabase, user.id, {
      documentId: result.documentId,
      fileName: result.fileName,
      chunkCount: result.chunkCount,
    });

    // Link thread to document
    if (threadId) {
      await ensureThread(supabase, user.id, threadId);
      await updateThreadDocument(supabase, threadId, doc.id);
    }

    // Get Pinecone index stats for the response
    let indexStats = null;
    try {
      const stats = await getIndexStats();
      const userNs = stats.namespaces?.[user.id];
      indexStats = {
        totalVectors: stats.totalRecordCount ?? 0,
        userVectors: userNs?.recordCount ?? 0,
        dimension: stats.dimension ?? 1536,
      };
    } catch { /* stats are best-effort */ }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
      chunkCount: result.chunkCount,
      fileSizeBytes: result.fileSizeBytes,
      dbDocId: doc.id,
      indexStats,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to upload and parse document.";
    console.error("Upload error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
  }
}
