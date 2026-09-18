"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DocumentRow, DOCUMENTS_BUCKET, MAX_PDF_BYTES } from "@/types/documents";

interface UploadButtonProps {
  threadId: string;
  /** Called once the file is in Storage; the parent then drives processing. */
  onUploaded: (doc: DocumentRow) => void;
}

export function UploadButton({ threadId, onUploaded }: UploadButtonProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setStatus("error");
      setStatusText("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setStatus("error");
      setStatusText("PDF must be under 50 MB.");
      return;
    }

    setStatus("uploading");
    setStatusText(`Uploading ${file.name}…`);

    let docId: string | null = null;
    try {
      // 1. Register the document
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSizeBytes: file.size, threadId }),
      });
      const data = await res.json();
      if (!res.ok || !data.document) throw new Error(data.error || "Upload failed");
      const doc = data.document as DocumentRow;
      docId = doc.id;

      // 2. Upload straight to Storage (avoids the serverless request body limit)
      const { error: uploadError } = await createClient()
        .storage.from(DOCUMENTS_BUCKET)
        .upload(doc.storage_path!, file, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);

      setStatus("idle");
      setStatusText("");
      onUploaded(doc);
    } catch (err) {
      // Don't leave an orphaned row behind when the file never reached Storage.
      if (docId) fetch(`/api/documents/${docId}`, { method: "DELETE" }).catch(() => {});
      setStatus("error");
      setStatusText(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        title="Upload a PDF to ask questions about it"
        className={`flex items-center justify-center gap-2 w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition
          ${status === "uploading"
            ? "border-white/10 text-[#555570] cursor-not-allowed"
            : "border-dashed border-[#4f6eff]/35 text-[#4f6eff] hover:bg-[#4f6eff]/07 hover:border-[#4f6eff]"
          }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {status === "uploading" ? "Uploading…" : "Upload PDF"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={status === "uploading" || !threadId}
          className="hidden"
        />
      </label>

      {statusText && (
        <span className={`text-[11.5px] leading-tight ${status === "error" ? "text-red-400" : "text-[#8888aa]"}`}>
          {statusText}
        </span>
      )}
    </div>
  );
}
