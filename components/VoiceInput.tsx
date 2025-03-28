'use client';
import React, { useState, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

interface VoiceInputProps {
  onResult: (text: string) => void;
  language?: string;
}

const VoiceInput = ({ 
  onResult, 
  language = 'en-US'
}: VoiceInputProps) => {
  const [error, setError] = useState<string>("");
  const [microphoneAvailable, setMicrophoneAvailable] = useState(true);
  const [isClient, setIsClient] = useState(false);

  const { 
    transcript, 
    listening, 
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      if (!browserSupportsSpeechRecognition) {
        setError("Browser doesn't support speech recognition.");
      }

      // Check microphone availability
      navigator.mediaDevices?.getUserMedia({ audio: true })
        .then(() => setMicrophoneAvailable(true))
        .catch(() => {
          setMicrophoneAvailable(false);
          setError("Please enable microphone access.");
        });
    }
  }, [browserSupportsSpeechRecognition, isClient]);

  const handleStart = () => {
    setError("");
    SpeechRecognition.startListening({ 
      continuous: true, 
      language: language
    });
  };

  const handleStop = () => {
    SpeechRecognition.stopListening();
    onResult(transcript);
    resetTranscript();
  };

  // Return null during SSR
  if (!isClient) {
    return null;
  }

  if (!browserSupportsSpeechRecognition) {
    return <div className="text-red-500">Browser doesn't support speech recognition.</div>;
  }

  return (
    <div className="p-4 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          {listening ? "Listening..." : "Press to speak"}
        </p>
        <button 
          className={`p-2 rounded ${
            listening 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-blue-500 hover:bg-blue-600"
          } text-white transition-colors`}
          onClick={listening ? handleStop : handleStart}
          disabled={!microphoneAvailable}
        >
          {listening ? "Stop" : "Start"}
        </button>
      </div>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      <div className="space-y-2">
        {transcript && (
          <p className="text-gray-800 font-medium">
            {transcript}
          </p>
        )}
      </div>
    </div>
  );
};

export default VoiceInput;
