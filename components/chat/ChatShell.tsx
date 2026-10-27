"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { SourceRef } from "@/types/chat";
import { RetrievalFilters, RetrievalTrace } from "@/types/rag";
import { SourceList } from "./SourceList";
import { TraceDetails } from "./TraceDetails";
import { citationComponents, linkCitations, VerificationSummary } from "./Citations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  trace?: RetrievalTrace;
  isStreaming?: boolean;
}

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  sources: unknown;
  trace?: unknown;
}

function toMessage(m: StoredMessage): Message {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    sources: m.sources
      ? typeof m.sources === "string" ? JSON.parse(m.sources) : (m.sources as SourceRef[])
      : [],
    trace: (m.trace as RetrievalTrace | null) ?? undefined,
  };
}

// After the answer text the server appends JSON blocks: __META__{...}__END_META__
// (sources and trace), then __VERIFY__{...}__END_VERIFY__ (the claim check).
const BLOCK_RE = /\s*__(META|VERIFY)__([\s\S]*?)__END_\1__/g;

/** Splits the streamed body into answer text and any complete JSON blocks. */
function parseStream(text: string): { cleanText: string; blocks: Record<string, unknown> } {
  const blocks: Record<string, unknown> = {};
  const rest = text.replace(BLOCK_RE, (_, name: string, json: string) => {
    try { blocks[name] = JSON.parse(json); } catch { /* ignore a malformed block */ }
    return "";
  });
  // Hide a block that has started arriving but isn't complete yet.
  const open = rest.search(/__(META|VERIFY)__/);
  return { cleanText: (open === -1 ? rest : rest.slice(0, open)).trimEnd(), blocks };
}

export function ChatShell({ threadId, initialMessages, filters, onSent }: {
  threadId: string;
  initialMessages?: StoredMessage[];
  /** Restricts retrieval for every question sent from here. */
  filters?: RetrievalFilters;
  /** Called with the question once the server has accepted it (the thread now exists). */
  onSent?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => initialMessages?.map(toMessage) ?? []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(!initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Parent already supplied this thread's history (or it's a brand-new thread).
    if (initialMessages) return;
    const loadMessages = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`/api/threads?threadId=${encodeURIComponent(threadId)}`);
        if (res.ok) {
          const data = await res.json();
          setMessages((data.messages ?? []).map(toMessage));
        }
      } catch (e) {
        console.error("Failed to load messages:", e);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const asstId = crypto.randomUUID();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", sources: [], isStreaming: true };

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text.trim(), filters }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      onSent?.(text.trim());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      const apply = (isStreaming: boolean) => {
        const { cleanText, blocks } = parseStream(accumulated);
        const meta = blocks.META as { sources?: SourceRef[]; trace?: RetrievalTrace } | undefined;
        const verify = blocks.VERIFY as { verification: RetrievalTrace["verification"]; ms: number } | undefined;
        const trace = meta?.trace && verify
          ? { ...meta.trace, verification: verify.verification, timings: { ...meta.trace.timings, verify: verify.ms } }
          : meta?.trace;
        setMessages((prev) => prev.map((m) => m.id === asstId
          ? { ...m, content: cleanText, isStreaming, ...(meta ? { sources: meta.sources ?? [], trace } : {}) }
          : m
        ));
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        apply(true);
      }
      apply(false);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => prev.map((m) => m.id === asstId
        ? { ...m, content: `⚠️ Error: ${reason}`, isStreaming: false }
        : m
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [threadId, isLoading, onSent, filters]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-7 flex flex-col gap-5">
        {isLoadingHistory ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <span className="spinner" />
            <p className="text-sm text-[#8888aa]">Loading conversation…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="w-16 h-16 bg-[#1e1e2a] border border-white/[0.07] rounded-2xl flex items-center justify-center text-[#4f6eff] opacity-70">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-[#e8e8f0]">Ask your knowledge base</p>
            <p className="text-sm text-[#8888aa] max-w-xs">Answers come only from your uploaded documents, with the sources they used.</p>
          </div>
        ) : null}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 items-start msg-animate ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              msg.role === "user"
                ? "bg-[#4f6eff] text-white"
                : "bg-[#1e1e2a] border border-white/[0.07] text-[#8888aa]"
            }`}>
              {msg.role === "user" ? "U" : "AI"}
            </div>

            {/* Body */}
            <div className={`max-w-[72%] flex flex-col ${msg.role === "user" ? "items-end" : ""}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed break-words ${
                msg.role === "user"
                  ? "bg-[#4f6eff] text-white rounded-br-sm whitespace-pre-wrap"
                  : `bg-[#1e1e2a] border text-[#e8e8f0] rounded-bl-sm ${
                      msg.isStreaming ? "border-[#4f6eff]/30 shadow-[inset_0_0_0_1px_rgba(79,110,255,0.12)]" : "border-white/[0.07]"
                    }`
              }`}>
                {msg.content ? (
                  msg.role === "assistant" ? (
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={citationComponents(msg.trace)}>
                        {linkCitations(msg.content)}
                      </ReactMarkdown>
                    </div>
                  ) : msg.content
                ) : (msg.isStreaming ? (
                  <span className="inline-flex items-center gap-1 h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555570] typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555570] typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555570] typing-dot" />
                  </span>
                ) : "")}
              </div>
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <SourceList sources={msg.sources} />
              )}
              {msg.role === "assistant" && msg.trace && (
                <VerificationSummary verification={msg.trace.verification} pending={!!msg.isStreaming} />
              )}
              {msg.role === "assistant" && msg.trace && <TraceDetails trace={msg.trace} />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2.5 px-6 py-4 border-t border-white/[0.07] bg-[#16161e] flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your documents… (Enter to send)"
          rows={1}
          disabled={isLoading}
          className="flex-1 bg-[#1e1e2a] border border-white/[0.07] rounded-2xl px-4 py-3 text-sm text-[#e8e8f0] placeholder:text-[#555570] resize-none min-h-[46px] max-h-40 overflow-y-auto outline-none transition focus:border-[#4f6eff] focus:ring-2 focus:ring-[#4f6eff]/25 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-[#4f6eff] hover:bg-[#6381ff] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white transition shadow-[0_0_20px_rgba(79,110,255,0.15)] hover:shadow-[0_4px_16px_rgba(79,110,255,0.35)] hover:-translate-y-px"
        >
          {isLoading ? (
            <span className="spinner" />
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
