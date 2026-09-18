import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthUser } from "@/lib/supabase/server";
import { deleteDocumentRow, getDocument, listUserDocuments } from "@/lib/db/documents";
import { deleteDocumentVectors } from "@/lib/pinecone/vector-store";
import { DOCUMENTS_BUCKET } from "@/types/documents";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Deletes a document's vectors, stored PDF and row. Threads keep their messages. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const doc = await getDocument(supabase, user.id, id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Legacy uploads of the same PDF share a content-hash documentId; keep the
    // vectors while another row still uses them.
    const others = await listUserDocuments(supabase, user.id);
    const shared = others.some((d) => d.id !== doc.id && d.document_id === doc.document_id);

    // Vectors first: if this fails the row stays, so the user can retry the delete.
    if (!shared) await deleteDocumentVectors(user.id, doc.document_id);

    if (doc.storage_path) {
      const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
      if (error) console.warn(`Failed to remove stored PDF ${doc.storage_path}:`, error);
    }

    await deleteDocumentRow(supabase, user.id, id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
