import type { DocumentRow } from "@/types/documents";

export const IN_PROGRESS: DocumentRow["status"][] = ["uploading", "parsing", "embedding"];

// Per page load, so two components never drive the same document at once.
const running = new Set<string>();

/**
 * Drives ingestion from the browser: each request embeds as much as fits in one
 * serverless call, so keep calling until the document is ready or failed.
 * onUpdate gets every new row (including a synthetic "failed" one on network errors).
 */
export async function driveProcessing(
  doc: DocumentRow,
  onUpdate: (doc: DocumentRow) => void,
  retry = false
) {
  if (running.has(doc.id)) return;
  running.add(doc.id);
  let latest = doc;
  try {
    for (let first = true; ; first = false) {
      const res = await fetch(`/api/documents/${doc.id}/process${retry && first ? "?retry=1" : ""}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.document) {
        onUpdate({ ...latest, status: "failed", error: data.error || "Processing interrupted" });
        return;
      }
      latest = data.document as DocumentRow;
      onUpdate(latest);
      if (latest.status === "ready" || latest.status === "failed") return;
    }
  } catch {
    onUpdate({ ...latest, status: "failed", error: "Network error while processing" });
  } finally {
    running.delete(doc.id);
  }
}
