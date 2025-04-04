// Array of filler sentences for the avatar to say while waiting for the actual response
const fillerSentences = [
  "Let me think about that for a moment.",
  "I'm processing your question.",
  "That's an interesting question.",
  "I'm analyzing the information.",
  "Let me find the best answer for you.",
  "I'm searching through my knowledge base.",
  "I'm formulating a response.",
  "That's a good question.",
  "I'm gathering the relevant information.",
  "Let me check my sources.",
  "I'm thinking about the best way to answer.",
  "I'm preparing a comprehensive response.",
  "I'm organizing my thoughts.",
  "I'm considering different perspectives.",
  "I'm evaluating the information.",
  "I'm synthesizing the data.",
  "I'm formulating a detailed answer.",
  "I'm processing the context.",
  "I'm preparing to respond.",
  "I'm thinking about how to best explain this."
];

// Function to get a random filler sentence
export function getRandomFillerSentence(): string {
  const randomIndex = Math.floor(Math.random() * fillerSentences.length);
  return fillerSentences[randomIndex];
}

// Function to get multiple random filler sentences
export function getRandomFillerSentences(count: number): string[] {
  const sentences: string[] = [];
  const availableSentences = [...fillerSentences];
  
  for (let i = 0; i < count && availableSentences.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableSentences.length);
    sentences.push(availableSentences[randomIndex]);
    availableSentences.splice(randomIndex, 1); // Remove the used sentence to avoid repetition
  }
  
  return sentences;
} 