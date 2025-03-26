'use client';
import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";

export default function Home() {
  const [response, setResponse] = useState("");

  const handleQuery = async (text: string) => {
    const res = await fetch("/api/query_ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text }),
    });
    const data = await res.json();
    setResponse(data.response);
  };

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">AI Voice Assistant</h1>
      <VoiceInput onResult={handleQuery} />
      <p className="mt-4">Response: {response}</p>
    </div>
  );
}
