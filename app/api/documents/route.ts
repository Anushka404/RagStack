import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { createPendingDocument, listUserDocuments } from "@/lib/db/documents";
import { ensureThread, updateThreadDocument } from "@/lib/db/threads";
import { MAX_PDF_BYTES } from "@/types/documents";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const documents = await listUserDocuments(supabase, user.id);
    return NextResponse.json({ documents });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to list documents";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Registers a new upload. The browser then uploads the file straight to Storage
 * at the returned storage_path and calls /api/documents/[id]/process.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { fileName, fileSizeBytes, threadId } = body as {
      fileName?: string;
      fileSizeBytes?: number;
      threadId?: string;
    };

    if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }
    if (!fileSizeBytes || fileSizeBytes <= 0 || fileSizeBytes > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF must be under 50 MB." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const document = await createPendingDocument(supabase, user.id, {
      id,
      fileName: fileName.split(/[\\/]/).pop() || fileName,
      fileSizeBytes,
      storagePath: `${user.id}/${id}.pdf`,
    });

    if (threadId) {
      await ensureThread(supabase, user.id, threadId);
      await updateThreadDocument(supabase, user.id, threadId, document.id);
    }

    return NextResponse.json({ document });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
