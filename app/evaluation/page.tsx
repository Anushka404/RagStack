"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import type { DocumentRow } from "@/types/documents";
import type { EvalCase } from "@/lib/rag/evaluate";

interface LiveMetrics {
  answers: number;
  avgTotalMs: number | null;
  stages: { stage: string; avgMs: number | null }[];
  verifiedAnswers: number;
  claims: number;
  supportedClaims: number;
  notFound: number;
  avgContextTokens: number;
}
interface RunResult {
  modes: { mode: string; label: string; hitRate: number; mrr: number; avgMs: number }[];
  rows: { id: string; question: string; results: Record<string, { rank: number | null; ms: number }> }[];
  skipped: number;
}

const card = "bg-[#16161e] border border-white/[0.05] rounded-xl";
const input = "px-3 py-2 bg-[#1e1e2a] border border-white/[0.07] rounded-lg text-sm text-[#e8e8f0] placeholder:text-[#555570] outline-none focus:border-[#4f6eff]";
const secs = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-xs text-[#8888aa]">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-[#555570] mt-0.5">{hint}</p>}
    </div>
  );
}

export default function EvaluationPage() {
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [question, setQuestion] = useState("");
  const [docId, setDocId] = useState("");
  const [pages, setPages] = useState("");
  const [formError, setFormError] = useState("");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState("");

  useEffect(() => {
    fetch("/api/eval/live").then((r) => r.json()).then((d) => !d.error && setLive(d)).catch(() => {});
    fetch("/api/eval/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
    fetch("/api/documents").then((r) => r.json()).then((d) => setDocuments((d.documents ?? []).filter((x: DocumentRow) => x.status === "ready"))).catch(() => {});
  }, []);

  const docName = (documentId: string) => documents.find((d) => d.document_id === documentId)?.file_name ?? "Deleted document";

  const addCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return setFormError("Enter a question first.");
    if (!docId) return setFormError("Pick the document that answers it.");
    const pageList = pages.split(",").map((p) => p.trim()).filter(Boolean).map(Number);
    if (pageList.some((p) => !Number.isInteger(p) || p < 1)) return setFormError("Pages must be whole numbers, like 1, 3.");
    setFormError("");
    const res = await fetch("/api/eval/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, expectedDocumentId: docId, expectedPages: pageList }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setFormError(data.error || "Couldn't add the question.");
    setCases((prev) => [...prev, data.case]);
    setQuestion(""); setPages("");
  };

  const removeCase = async (id: string) => {
    await fetch(`/api/eval/cases/${id}`, { method: "DELETE" });
    setCases((prev) => prev.filter((c) => c.id !== id));
  };

  const runBenchmark = async () => {
    setRunning(true); setRunError("");
    try {
      const res = await fetch("/api/eval/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Benchmark failed");
      setRun(data);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Benchmark failed");
    } finally {
      setRunning(false);
    }
  };

  const maxStage = Math.max(...(live?.stages.map((s) => s.avgMs ?? 0) ?? [0]), 1);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0f0f13] text-[#e8e8f0]">
      <AppNav />
      <main className="flex-1 overflow-y-auto px-7 py-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          <div>
            <h1 className="text-xl font-semibold">Evaluation</h1>
            <p className="text-sm text-[#8888aa]">How well retrieval finds the right evidence, how fast each stage is, and how faithful answers are to their sources.</p>
          </div>

          {/* ── Live metrics ── */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">From your chats</h2>
              <p className="text-xs text-[#8888aa]">Measured on your last {live?.answers ?? 0} answers. No extra model calls.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Metric label="Answers" value={live ? String(live.answers) : "—"} />
              <Metric label="Avg response time" value={secs(live?.avgTotalMs ?? null)} />
              <Metric
                label="Claims supported"
                value={live && live.claims ? pct(live.supportedClaims / live.claims) : "—"}
                hint={live ? `${live.supportedClaims} of ${live.claims} claims in ${live.verifiedAnswers} checked answers` : undefined}
              />
              <Metric label="Not-found answers" value={live && live.answers ? pct(live.notFound / live.answers) : "—"} hint="Replied that the documents don't say" />
              <Metric label="Avg context sent" value={live ? `≈${live.avgContextTokens} tokens` : "—"} />
            </div>
            {live && live.stages.length > 0 && (
              <div className={`${card} p-4`}>
                <p className="text-xs text-[#8888aa] mb-2">Average time per pipeline stage</p>
                <div className="flex flex-col gap-1.5">
                  {live.stages.map((s) => (
                    <div key={s.stage} className="grid grid-cols-[80px_minmax(0,1fr)_60px] items-center gap-3 text-xs">
                      <span className="text-[#b8b8cc]">{s.stage}</span>
                      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className="h-full rounded-full bg-[#4f6eff]" style={{ width: `${((s.avgMs ?? 0) / maxStage) * 100}%` }} />
                      </div>
                      <span className="text-right font-mono">{secs(s.avgMs)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Retrieval benchmark ── */}
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">Retrieval benchmark</h2>
              <p className="text-xs text-[#8888aa]">
                Add questions whose answer you know the location of, then compare retrieval modes. Hit rate = evidence found in the top 6 chunks;
                MRR = average of 1/rank (1.0 means always ranked first). Retrieval only, so no LLM quota is used.
              </p>
            </div>

            <form onSubmit={addCase} className={`${card} p-4 grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px_auto] gap-3 items-end`}>
              <label className="flex flex-col gap-1.5 text-xs text-[#8888aa]">
                Question
                <input className={input} value={question} onChange={(e) => { setQuestion(e.target.value); setFormError(""); }} placeholder="What was the peak wave height in 2027?" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-[#8888aa]">
                Answer is in
                <select className={input} value={docId} onChange={(e) => { setDocId(e.target.value); setFormError(""); }}>
                  <option value="">Choose a document</option>
                  {documents.map((d) => <option key={d.id} value={d.document_id}>{d.file_name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-[#8888aa]">
                Pages (optional)
                <input className={input} value={pages} onChange={(e) => { setPages(e.target.value); setFormError(""); }} placeholder="1, 2" />
              </label>
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium border border-white/[0.1] hover:bg-white/[0.05]">Add question</button>
              {formError && <p className="md:col-span-4 text-[13px] text-red-400">{formError}</p>}
            </form>

            {cases.length > 0 && (
              <div className={`${card} divide-y divide-white/[0.05]`}>
                {cases.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 min-w-0">{c.question}</span>
                    <span className="text-xs text-[#8888aa] whitespace-nowrap">
                      {docName(c.expected_document_id)}{c.expected_pages.length ? ` · p. ${c.expected_pages.join(", ")}` : ""}
                    </span>
                    <button onClick={() => removeCase(c.id)} aria-label={`Remove "${c.question}"`} className="text-xs text-[#8888aa] hover:text-red-400">Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={runBenchmark}
                disabled={running || cases.length === 0}
                className="px-4 py-2 bg-[#4f6eff] hover:bg-[#6381ff] disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition"
              >
                {running ? "Running…" : `Run benchmark (${cases.length} question${cases.length === 1 ? "" : "s"})`}
              </button>
              {cases.length === 0 && <span className="text-xs text-[#555570]">Add at least one question to run it.</span>}
              {runError && <span className="text-[13px] text-red-400">{runError}</span>}
            </div>

            {run && (
              <>
                <div className="grid md:grid-cols-3 gap-3">
                  {run.modes.map((m) => (
                    <div key={m.mode} className={`${card} p-4 flex flex-col gap-2`}>
                      <p className="text-sm font-medium">{m.label}</p>
                      {[["Hit rate", m.hitRate, pct(m.hitRate)], ["MRR", m.mrr, m.mrr.toFixed(2)]].map(([label, v, shown]) => (
                        <div key={label as string} className="grid grid-cols-[60px_minmax(0,1fr)_40px] items-center gap-2 text-xs">
                          <span className="text-[#8888aa]">{label}</span>
                          <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                            <div className="h-full rounded-full bg-[#4f6eff]" style={{ width: `${(v as number) * 100}%` }} />
                          </div>
                          <span className="text-right font-mono">{shown}</span>
                        </div>
                      ))}
                      <p className="text-xs text-[#8888aa]">Avg latency <span className="font-mono text-[#e8e8f0]">{secs(m.avgMs)}</span></p>
                    </div>
                  ))}
                </div>
                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[#8888aa]">
                        <th className="px-4 py-2 font-medium">Question</th>
                        {run.modes.map((m) => <th key={m.mode} className="px-4 py-2 font-medium whitespace-nowrap">{m.label.split(" (")[0]}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {run.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2">{r.question}</td>
                          {run.modes.map((m) => {
                            const rank = r.results[m.mode].rank;
                            return (
                              <td key={m.mode} className={`px-4 py-2 whitespace-nowrap ${rank === 1 ? "text-emerald-400" : rank ? "text-amber-400" : "text-red-400"}`}>
                                {rank ? `rank ${rank}` : "missed"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {run.skipped > 0 && <p className="text-xs text-[#8888aa]">{run.skipped} more questions skipped to stay within one request.</p>}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
