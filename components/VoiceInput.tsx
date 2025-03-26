import React, { useState } from "react";
import SpeechRecognition, {useSpeechRecognition} from "react-speech-recognition";

const VoiceInput = ({ onResult }: { onResult: (text: string) => void }) => {
  const { transcript, listening, resetTranscript } = useSpeechRecognition();

  const handleStart = () => SpeechRecognition.startListening({ continuous: true });
  const handleStop = () => {
    SpeechRecognition.stopListening();
    onResult(transcript);
    resetTranscript();
  };

  return (
    <div className="p-4 border rounded-lg">
      <p className="text-gray-600">{listening ? "Listening..." : "Press to speak"}</p>
      <button className="p-2 bg-blue-500 text-white rounded" onClick={listening ? handleStop : handleStart}>
        {listening ? "Stop" : "Start"}
      </button>
      <p className="mt-2">{transcript}</p>
    </div>
  );
};

export default VoiceInput;
