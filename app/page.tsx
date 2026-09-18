"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ChatShell, type StoredMessage } from "@/components/chat/ChatShell";
import { UploadButton } from "@/components/chat/UploadButton";
import { DocumentList } from "@/components/chat/DocumentList";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { DocumentRow } from "@/types/documents";

function generateThreadId() {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ThreadInfo {
  id: string;
  updated_at: string;
  documents: { id: string; file_name: string; chunk_count: number } | null;
}
interface IndexStats { userVectors: number; documentCount: number; dimension: number; }

const IN_PROGRESS: DocumentRow["status"][] = ["uploading", "parsing", "embedding"];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export default function Home() {
  // Empty until mounted: a random ID generated during render would differ between
  // server and client and break hydration.
  const [threadId, setThreadId] = useState<string>("");
  // Document linked to the current thread (null = none linked).
  const [threadDocId, setThreadDocId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [resetKey, setResetKey] = useState(0);
  const [userEmail, setUserEmail] = useState("");
  const [pastThreads, setPastThreads] = useState<ThreadInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  // Messages for the thread shown on first load, fetched together with the thread list.
  const [initialMessages, setInitialMessages] = useState<StoredMessage[] | undefined>(undefined);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const processingIds = useRef(new Set<string>());
  const router = useRouter();
  const supabase = createClient();

  // Thread's own document, else the latest ready one (retrieval searches all of them anyway).
  const activeDoc =
    documents.find((d) => d.id === threadDocId) ??
    documents.find((d) => d.status === "ready") ??
    null;

  // Load stats
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/pinecone-stats");
      if (res.ok) setStats(await res.json());
    } catch { /* best effort */ }
  }, []);

  const upsertDocument = useCallback((doc: DocumentRow) => {
    setDocuments((prev) =>
      prev.some((d) => d.id === doc.id) ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev]
    );
  }, []);

  const markFailed = useCallback((id: string, error: string) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status: "failed", error } : d)));
  }, []);

  // Drives ingestion: each call embeds as much as fits in one request, so keep
  // calling until the document is ready or failed.
  const processDocument = useCallback(async (id: string, retry = false) => {
    if (processingIds.current.has(id)) return;
    processingIds.current.add(id);
    try {
      for (let first = true; ; first = false) {
        const res = await fetch(`/api/documents/${id}/process${retry && first ? "?retry=1" : ""}`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.document) {
          markFailed(id, data.error || "Processing interrupted");
          return;
        }
        const doc = data.document as DocumentRow;
        upsertDocument(doc);
        if (doc.status === "ready") { refreshStats(); return; }
        if (doc.status === "failed") return;
      }
    } catch {
      markFailed(id, "Network error while processing");
    } finally {
      processingIds.current.delete(id);
    }
  }, [upsertDocument, markFailed, refreshStats]);

  useEffect(() => {
    // Stats and threads load in parallel; neither waits on the other.
    refreshStats();
    const load = async () => {
      try {
        const res = await fetch("/api/threads");
        if (!res.ok) throw new Error(`Failed to load threads: ${res.status}`);
        const data = await res.json();
        setUserEmail(data.email || "");
        const docs: DocumentRow[] = data.documents ?? [];
        setDocuments(docs);
        // Resume ingestion interrupted by a reload or closed tab.
        docs.filter((d) => IN_PROGRESS.includes(d.status)).forEach((d) => processDocument(d.id));
        if (data.threads?.length > 0) {
          setPastThreads(data.threads);
          const latest = data.threads[0];
          setInitialMessages(data.latestMessages ?? []);
          setThreadId(latest.id);
          setThreadDocId(latest.documents?.id ?? null);
          setResetKey((k) => k + 1);
        } else {
          setInitialMessages([]);
          setThreadId(generateThreadId());
        }
      } catch (e) {
        console.error(e);
        setInitialMessages([]);
        setThreadId(generateThreadId());
      } finally {
        setInitialLoaded(true);
      }
    };
    load();
  }, [refreshStats, processDocument]);

  const handleUploaded = useCallback((doc: DocumentRow) => {
    upsertDocument(doc);
    setThreadDocId(doc.id);
    processDocument(doc.id);
  }, [upsertDocument, processDocument]);

  const handleDeleteDocument = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete "${doc.file_name}"? Its content will no longer be used to answer questions.`)) return;
    setDeletingIds((prev) => new Set(prev).add(doc.id));
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setPastThreads((prev) => prev.map((t) => (t.documents?.id === doc.id ? { ...t, documents: null } : t)));
      if (threadDocId === doc.id) setThreadDocId(null);
      refreshStats();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(doc.id); return next; });
    }
  };

  const handleNewThread = () => {
    setInitialMessages([]);
    setThreadId(generateThreadId());
    setThreadDocId(null);
    setResetKey((k) => k + 1);
  };

  const handleSwitchThread = (t: ThreadInfo) => {
    setInitialMessages(undefined);
    setThreadId(t.id);
    setThreadDocId(t.documents?.id ?? null);
    setResetKey((k) => k + 1);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f13] text-[#e8e8f0]">

      {/* ── Sidebar ── */}
      <aside className="w-[280px] min-w-[280px] bg-[#12121a] border-r border-white/[0.07] flex flex-col px-4 py-5 gap-4 overflow-hidden">

        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-9 h-9 bg-[#4f6eff] rounded-lg flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(79,110,255,0.2)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span className="text-lg font-bold bg-gradient-to-br from-white to-[#a0a8ff] bg-clip-text text-transparent">
            AskPDF
          </span>
        </div>

        {/* New Chat */}
        <button
          onClick={handleNewThread}
          className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-[#1e1e2a] border border-white/[0.07] rounded-xl text-sm font-medium text-[#e8e8f0] transition hover:bg-[#26263a] hover:border-[#4f6eff] hover:text-[#6381ff] hover:shadow-[0_0_20px_rgba(79,110,255,0.12)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Chat
        </button>

        {/* Past Threads */}
        {pastThreads.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#555570]">Recent</p>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {pastThreads.slice(0, 10).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSwitchThread(t)}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-[13px] transition border ${
                    t.id === threadId
                      ? "bg-[#1e1e2a] border-[#4f6eff] text-[#e8e8f0]"
                      : "border-transparent text-[#8888aa] hover:bg-[#1e1e2a] hover:text-[#e8e8f0]"
                  }`}
                >
                  <span className="text-sm">💬</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {t.documents?.file_name ? t.documents.file_name.slice(0, 22) : t.id.split("_").pop()?.slice(0, 10)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="flex flex-col gap-1.5 min-h-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#555570]">Documents</p>
          <DocumentList
            documents={documents}
            activeId={activeDoc?.id ?? null}
            deletingIds={deletingIds}
            onDelete={handleDeleteDocument}
            onRetry={(doc) => processDocument(doc.id, true)}
          />
        </div>

        {/* ── Footer: Upload + Storage Metrics + User ── */}
        <div className="mt-auto pt-3 border-t border-white/[0.07] flex flex-col gap-3">
          <UploadButton threadId={threadId} onUploaded={handleUploaded} />

          {/* Storage & Metrics */}
          <div className="bg-[#1a1a26] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555570]">Storage & Metrics</p>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <span className="text-[10.5px] text-[#555570]">Your Vectors</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">
                  {stats ? stats.userVectors.toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10.5px] text-[#555570]">Your Documents</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">
                  {stats ? stats.documentCount.toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10.5px] text-[#555570]">Dimensions</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">
                  {stats ? stats.dimension : "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10.5px] text-[#555570]">Last Upload</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">
                  {documents[0]?.file_size_bytes ? formatBytes(documents[0].file_size_bytes) : "—"}
                </span>
              </div>
            </div>

          </div>

          {/* User */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[#555570] overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]" title={userEmail}>
              {userEmail}
            </span>
            <button
              onClick={handleSignOut}
              className="text-[11.5px] px-2.5 py-1 border border-white/[0.07] rounded-lg text-[#8888aa] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-7 py-4 border-b border-white/[0.07] bg-[#16161e] flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[17px] font-semibold text-[#e8e8f0] tracking-tight">Ask your PDF</h1>
            {activeDoc && (
              <span className="text-xs px-2.5 py-1 bg-[#4f6eff]/15 border border-[#4f6eff]/30 rounded-full text-[#8ba0ff] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                {activeDoc.file_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#555570]">Thread</span>
            <code className="text-[11px] px-2 py-0.5 bg-[#1e1e2a] border border-white/[0.07] rounded-md text-[#8888aa] font-mono">
              {threadId ? threadId.split("_").slice(-1)[0] : "—"}
            </code>
          </div>
        </header>
        {initialLoaded ? (
          <ChatShell key={resetKey} threadId={threadId} initialMessages={initialMessages} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="spinner" />
            <p className="text-sm text-[#8888aa]">Loading conversation…</p>
          </div>
        )}
      </main>
    </div>
  );
}
