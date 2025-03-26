import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
console.log("🔍 OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

async function createAssistant() {
  try {
    const assistant = await openai.beta.assistants.create({
      name: "Voice QA Assistant",
      instructions: "Answer queries using only the retrieved data from Pinecone. Do not use external sources.",
      model: "gpt-4-turbo",
      tools: [{ type: "file_search" }],
    });

    console.log("Assistant ID:", assistant.id);
  } catch (error) {
    console.error("Error creating assistant:", error);
  }
}

createAssistant();
