'use client';
import React, { useState, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

interface VoiceInputProps {
  onResult: (text: string) => void;
  language?: string;
}

// Text correction function
const correctText = (text: string): string => {
  // Convert "simply q" to "simply cue"
  text = text.replace(/\bsimply\s+q\b/gi, "simply cue");
  
  // Convert "graphic" to "graphy"
  text = text.replace(/\bgraphic\b/gi, "graphy");
  
  return text;
};

const VoiceInput = ({ 
  onResult, 
  language = 'en-US'
}: VoiceInputProps) => {
  const [error, setError] = useState<string>("");
  const [microphoneAvailable, setMicrophoneAvailable] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [isListening, setIsListening] = useState(false);

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
    setIsListening(true);
    SpeechRecognition.startListening({ 
      continuous: true, 
      language: language
    });
  };

  const handleStop = () => {
    SpeechRecognition.stopListening();
    setIsListening(false);
    // Process the text before sending it
    const correctedText = correctText(transcript);
    onResult(correctedText);
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

      {isListening && (
        <div className="mt-2 flex justify-center">
          <div className="flex space-x-1">
            <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '100ms' }}></div>
            <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
            <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
            <div className="w-2 h-8 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceInput;
