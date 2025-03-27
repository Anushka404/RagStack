"use client";
import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";

export default function Home() {
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleQuery = async (text: string) => {
    setResponse(""); // Clear previous response
    setIsLoading(true); // Show loading state

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
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      setResponse((prev) => prev + chunk);
    }
  };

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">AI Voice Assistant</h1>
      <VoiceInput onResult={handleQuery} />

      <div className="mt-4">
        <p className="font-semibold">Response:</p>
        <p className="mt-2 bg-gray-100 p-3 rounded-md min-h-[50px] text-black">
          {isLoading ? "Generating response..." : response || "Waiting for input..."}
        </p>
      </div>
    </div>
  );
}
