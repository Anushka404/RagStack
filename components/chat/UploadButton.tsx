"use client";

import { useRef, useState } from "react";

interface UploadButtonProps {
  threadId: string;
  onUploadSuccess: (
    fileName: string,
    chunkCount: number,
    fileSizeBytes?: number,
    indexStats?: { totalVectors: number; userVectors: number; dimension: number }
  ) => void;
}

export function UploadButton({ threadId, onUploadSuccess }: UploadButtonProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setStatusText(`Uploading ${file.name}…`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("threadId", threadId);

      const res = await fetch("/api/upload-pdf", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        setStatusText(`✓ ${data.fileName} — ${data.chunkCount} chunks`);
        onUploadSuccess(data.fileName, data.chunkCount, data.fileSizeBytes, data.indexStats ?? undefined);
      } else {
        setStatus("error");
        setStatusText(`Error: ${data.error || "Upload failed"}`);
      }
    } catch {
      setStatus("error");
      setStatusText("Network error during upload.");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
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
          disabled={status === "uploading"}
          className="hidden"
        />
      </label>

      {statusText && (
        <span className={`text-[11.5px] leading-tight ${
          status === "success" ? "text-emerald-400" :
          status === "error"   ? "text-red-400" :
                                 "text-[#8888aa]"
        }`}>
          {statusText}
        </span>
      )}
    </div>
  );
}
