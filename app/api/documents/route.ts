import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { createPendingDocument, listUserDocuments } from "@/lib/db/documents";
import { ensureThread, updateThreadDocument } from "@/lib/db/threads";
import { fileExtension, MAX_FILE_BYTES } from "@/types/documents";

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
    const { fileName, fileSizeBytes, threadId, collection, year, tags } = body as {
      fileName?: string;
      fileSizeBytes?: number;
      threadId?: string;
      collection?: unknown;
      year?: unknown;
      tags?: unknown;
    };

    const ext = fileName ? fileExtension(fileName) : null;
    if (!fileName || !ext) {
      return NextResponse.json({ error: "Supported formats: PDF, DOCX, TXT, Markdown and CSV." }, { status: 400 });
    }
    if (!fileSizeBytes || fileSizeBytes <= 0 || fileSizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Files must be under 50 MB." }, { status: 400 });
    }
    const yearNum = year === undefined || year === null || year === "" ? null : Number(year);
    if (yearNum !== null && !(Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2100)) {
      return NextResponse.json({ error: "Year must be between 1900 and 2100." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const document = await createPendingDocument(supabase, user.id, {
      id,
      fileName: fileName.split(/[\\/]/).pop() || fileName,
      fileSizeBytes,
      storagePath: `${user.id}/${id}.${ext}`,
      collection: (typeof collection === "string" && collection.trim().slice(0, 60)) || "General",
      year: yearNum,
      tags: Array.isArray(tags)
        ? [...new Set(tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 10)
        : [],
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
