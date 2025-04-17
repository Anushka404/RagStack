"use client";
import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";

export default function Home() {
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [query, setQuery] = useState(""); // 🆕 state for typed input

  const handleQuery = async (text: string) => {
    setResponse("");
    setIsLoading(true);

    const res = await fetch("/api/query_ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text }),
    });

    if (!res.body) {
      setResponse("Failed to fetch response.");
      setIsLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    setIsLoading(false);

    let sentenceBuffer = "";
    let fillerSentencePromise = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);

      setResponse((prev) => prev + chunk);
      sentenceBuffer += chunk;
    }

    if (sentenceBuffer.trim() && fillerSentencePromise) {
      await fillerSentencePromise;
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsParsing(true);
    setUploadStatus("Uploading PDF....");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload_doc", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadStatus("Upload and parsing successful.");
      } else {
        setUploadStatus(
          `Error: ${data?.error?.message || JSON.stringify(data) || "Upload failed."}`
        );
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadStatus("Error uploading or parsing PDF.");
    }

    setIsParsing(false);
  };

  const handleSubmitText = () => {
    if (query.trim()) {
      handleQuery(query.trim());
      setQuery("");
    }
  };

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Ask it away</h1>

      {/* Text Input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmitText()}
          placeholder="Type your question..."
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-white"
        />
        <button
          onClick={handleSubmitText}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Ask
        </button>
      </div>

      {/* Voice Input */}
      <VoiceInput onResult={handleQuery} />

      {/* Response Section */}
      <div className="mt-4">
        <p className="font-semibold">Response:</p>
        <p className="mt-2 bg-gray-100 p-3 rounded-md min-h-[50px] text-black">
          {isLoading ? "Generating response..." : response || "Waiting for input..."}
        </p>
      </div>

      {/* PDF Upload Section */}
      <div className="mt-6">
        <p className="font-semibold mb-2">Upload a PDF Document:</p>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-2"
        />
        <button
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          disabled={!file || isParsing}
          onClick={handleUpload}
        >
          {isParsing ? "Parsing..." : "Upload & Parse"}
        </button>
        {uploadStatus && (
          <p className="mt-2 text-sm text-gray-600">{uploadStatus}</p>
        )}
      </div>
    </div>
  );
}
