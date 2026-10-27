import { SupabaseClient } from "@supabase/supabase-js";
import { EvalCase } from "@/lib/rag/evaluate";
import { RetrievalTrace } from "@/types/rag";

const CASE_COLUMNS = "id, question, expected_document_id, expected_pages";

export async function listEvalCases(supabase: SupabaseClient, userId: string): Promise<EvalCase[]> {
  const { data, error } = await supabase
    .from("eval_cases")
    .select(CASE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EvalCase[];
}

export async function createEvalCase(
  supabase: SupabaseClient,
  userId: string,
  c: Omit<EvalCase, "id">
): Promise<EvalCase> {
  const { data, error } = await supabase
    .from("eval_cases")
    .insert({ user_id: userId, ...c })
    .select(CASE_COLUMNS)
    .single();
  if (error) throw error;
  return data as EvalCase;
}

export async function deleteEvalCase(supabase: SupabaseClient, userId: string, id: string) {
  const { error } = await supabase.from("eval_cases").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** The user's recent answers with their traces, for the live metrics. */
export async function getRecentAnswers(supabase: SupabaseClient, userId: string, limit = 200) {
  const { data, error } = await supabase
    .from("messages")
    .select("content, trace, created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .not("trace", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as { content: string; trace: RetrievalTrace; created_at: string }[];
}
