"use client";
import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";
import { useHeyGen } from "@/app/main";
import { getRandomFillerSentence } from "@/app/utils/fillerSentences";

export default function Home() {
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { videoRef, startSession, endSession, speak, loading } = useHeyGen();

  const handleQuery = async (text: string) => {
    setResponse(""); // Clear previous response
    setIsLoading(true); // Show loading state

    // Start the avatar session if not already started
    if (!videoRef.current?.srcObject) {
      await startSession();
    }

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
    
    let fullResponse = "";
    let sentenceBuffer = ""; 
    let lastCommaTime = 0;
    let commaDetected = false;
    let contextReadyMarkerFound = false;
    let fillerSentencePromise = null;
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      
      // Check for context ready marker
      if (chunk.includes("__CONTEXT_READY__") && !contextReadyMarkerFound) {
        contextReadyMarkerFound = true;
        // Start speaking filler sentence but don't await it
        fillerSentencePromise = speak(getRandomFillerSentence());
        continue;
      }
      
      setResponse((prev) => prev + chunk); // Append instead of replacing
      sentenceBuffer += chunk; // Append to sentence buffer

      // Check for comma
      if (/,/.test(chunk)) {
        commaDetected = true;
        lastCommaTime = Date.now();
      }

      // Check if sentence is complete
      if (/[.!?]/.test(chunk)) {
        // If we detected a comma recently, wait for 1 second
        if (commaDetected && Date.now() - lastCommaTime < 1000) {
          await new Promise(resolve => setTimeout(resolve, 1000 - (Date.now() - lastCommaTime)));
        }
        
        // If we have a filler sentence in progress, wait for it to finish
        if (fillerSentencePromise) {
          await fillerSentencePromise;
          fillerSentencePromise = null;
        }
        
        await speak(sentenceBuffer.trim()); 
        sentenceBuffer = ""; 
        commaDetected = false;
      }
    }
      
    if (sentenceBuffer.trim()) {
      // If we have a filler sentence in progress, wait for it to finish
      if (fillerSentencePromise) {
        await fillerSentencePromise;
        fillerSentencePromise = null;
      }
      await speak(sentenceBuffer.trim());
    }
  };

  return (
    <>
    <div className="p-10">
      <h1 className="text-2xl font-bold">AI Voice Assistant</h1>
      <VoiceInput onResult={handleQuery} />

      <div className="mt-4">
        <p className="font-semibold">Response:</p>
        <p className="mt-2 bg-gray-100 p-3 rounded-md min-h-[50px] text-black">
          {isLoading ? "Generating response..." : response || "Waiting for input..."}
        </p>
      </div>
      <div className="mt-6">
        <p className="font-semibold">Avatar:</p>
        <video
          ref={videoRef}
          className="w-full max-h-[400px] border rounded-lg my-5"
          autoPlay
        ></video>
      </div>

      {/* Buttons to Control Avatar */}
      <div className="mt-4 flex gap-4">
        <button
          onClick={startSession}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          {loading ? "Starting..." : "Start Avatar"}
        </button>
        <button
          onClick={endSession}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          End Avatar
        </button>
      </div>
    </div>
   
    </>
  );
}