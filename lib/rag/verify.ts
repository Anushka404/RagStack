import { HumanMessage } from "@langchain/core/messages";
import { utilityModel } from "@/lib/ai/model";
import { VERIFY_PROMPT } from "@/lib/ai/prompts";
import { parseClaims, Verification } from "./claims";
import { DEMO_STAGE } from "@/lib/stage";

/**
 * Claim checking is part of demo stage 3. Set VERIFY_ANSWERS=false to skip the extra LLM
 * call per answer (saves free-tier quota).
 */
export const verificationEnabled = DEMO_STAGE >= 3 && process.env.VERIFY_ANSWERS !== "false";

/**
 * Answer verification: a second LLM pass checks each claim of the answer against
 * the numbered context passages. Never throws; failures come back as { error }.
 */
export async function verifyAnswer(answer: string, context: string, passageCount: number): Promise<Verification> {
  try {
    const prompt = await VERIFY_PROMPT.format({ context, answer });
    const res = await utilityModel.invoke([new HumanMessage(prompt)]);
    const raw = typeof res.content === "string" ? res.content : "";
    const claims = parseClaims(raw, passageCount);
    if (!claims) return { error: "The checker's reply couldn't be read." };
    const served = res.response_metadata?.model_name;
    return {
      claims,
      supported: claims.filter((c) => c.supported).length,
      total: claims.length,
      model: typeof served === "string" && served ? served : "utility model",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Verification failed." };
  }
}
