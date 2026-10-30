"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ChatShell, type StoredMessage } from "@/components/chat/ChatShell";
import { DocumentList } from "@/components/chat/DocumentList";
import { AppNav } from "@/components/AppNav";
import { UploadDialog } from "@/components/upload/UploadDialog";
import { driveProcessing, IN_PROGRESS } from "@/lib/client/processing";
import { formatBytes } from "@/lib/client/format";
import { DEMO_STAGE } from "@/lib/stage";
import type { DocumentRow } from "@/types/documents";
import type { RetrievalFilters } from "@/types/rag";

function generateThreadId() {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ThreadInfo {
  id: string;
  title: string | null;
  updated_at: string;
  documents: { id: string; file_name: string; chunk_count: number } | null;
}
interface IndexStats { userVectors: number; documentCount: number; dimension: number; }
/** Select values; "" means no restriction. docId is the Pinecone documentId. */
interface FilterState { collection: string; year: string; docId: string }

const selectClass =
  "bg-[#1e1e2a] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-[#e8e8f0] outline-none focus:border-[#4f6eff] max-w-[180px]";

export default function Home() {
  // Empty until mounted: a random ID generated during render would differ between
  // server and client and break hydration.
  const [threadId, setThreadId] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [resetKey, setResetKey] = useState(0);
  const [pastThreads, setPastThreads] = useState<ThreadInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  // Messages for the thread shown on first load, fetched together with the thread list.
  const [initialMessages, setInitialMessages] = useState<StoredMessage[] | undefined>(undefined);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filter, setFilter] = useState<FilterState>({ collection: "", year: "", docId: "" });

  const readyDocs = documents.filter((d) => d.status === "ready");
  const collections = [...new Set(documents.map((d) => d.collection))].sort();
  const years = [...new Set(readyDocs.filter((d) => !filter.collection || d.collection === filter.collection)
    .map((d) => d.year).filter((y): y is number => y !== null))].sort((a, b) => b - a);
  const docOptions = readyDocs.filter((d) =>
    (!filter.collection || d.collection === filter.collection) && (!filter.year || d.year === Number(filter.year))
  );
  const filterDoc = documents.find((d) => d.document_id === filter.docId);

  const filters = useMemo<RetrievalFilters>(() => ({
    ...(filter.collection ? { collection: filter.collection } : {}),
    ...(filter.year ? { years: [Number(filter.year)] } : {}),
    ...(filter.docId ? { documentIds: [filter.docId] } : {}),
  }), [filter]);

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
    if (doc.status === "ready") refreshStats();
  }, [refreshStats]);

  // Moves a thread to the top of Recent, adding it if new. A thread exists server-side
  // once it has a message or an upload; undefined fields keep the thread's current values.
  const touchThread = useCallback((id: string, patch: Partial<Pick<ThreadInfo, "title" | "documents">> = {}) => {
    setPastThreads((prev) => {
      const existing = prev.find((t) => t.id === id);
      const entry: ThreadInfo = {
        id,
        updated_at: new Date().toISOString(),
        title: existing?.title ?? patch.title ?? null,
        documents: patch.documents === undefined ? existing?.documents ?? null : patch.documents,
      };
      return [entry, ...prev.filter((t) => t.id !== id)];
    });
  }, []);

  useEffect(() => {
    // Stats and threads load in parallel; neither waits on the other.
    refreshStats();
    // "Ask about this in chat" from the knowledge base arrives with filters in the URL.
    const params = new URLSearchParams(window.location.search);
    const fromKnowledgeBase = ["collection", "year", "doc"].some((k) => params.has(k));
    if (fromKnowledgeBase) {
      setFilter({ collection: params.get("collection") ?? "", year: params.get("year") ?? "", docId: params.get("doc") ?? "" });
      window.history.replaceState(null, "", "/");
    }
    const load = async () => {
      try {
        const res = await fetch("/api/threads");
        if (!res.ok) throw new Error(`Failed to load threads: ${res.status}`);
        const data = await res.json();
        const docs: DocumentRow[] = data.documents ?? [];
        setDocuments(docs);
        // Resume ingestion interrupted by a reload or closed tab.
        docs.filter((d) => IN_PROGRESS.includes(d.status)).forEach((d) => driveProcessing(d, upsertDocument));
        setPastThreads(data.threads ?? []);
        if (data.threads?.length > 0 && !fromKnowledgeBase) {
          setInitialMessages(data.latestMessages ?? []);
          setThreadId(data.threads[0].id);
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
  }, [refreshStats, upsertDocument]);

  const handleDocument = useCallback((doc: DocumentRow) => {
    upsertDocument(doc);
    if (doc.status === "uploading") {
      touchThread(threadId, { documents: { id: doc.id, file_name: doc.file_name, chunk_count: doc.chunk_count } });
    }
  }, [upsertDocument, touchThread, threadId]);

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
      if (filter.docId === doc.document_id) setFilter((f) => ({ ...f, docId: "" }));
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
    setResetKey((k) => k + 1);
  };

  const handleSwitchThread = (t: ThreadInfo) => {
    setInitialMessages(undefined);
    setThreadId(t.id);
    setResetKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0f0f13] text-[#e8e8f0]">
      <AppNav />
      <div className="flex flex-1 min-h-0">

      {/* ── Sidebar ── */}
      <aside className="w-[280px] min-w-[280px] bg-[#12121a] border-r border-white/[0.07] flex flex-col px-4 py-5 gap-4 overflow-hidden">

        {/* New Chat */}
        <button
          onClick={handleNewThread}
          className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-[#1e1e2a] border border-white/[0.07] rounded-xl text-sm font-medium text-[#e8e8f0] transition hover:bg-[#26263a] hover:border-[#4f6eff] hover:text-[#6381ff] hover:shadow-[0_0_20px_rgba(79,110,255,0.12)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New chat
        </button>

        {/* Past Threads */}
        {pastThreads.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#555570]">Recent</p>
            <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
              {pastThreads.slice(0, 15).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSwitchThread(t)}
                  title={t.title ?? undefined}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-[13px] transition border ${
                    t.id === threadId
                      ? "bg-[#1e1e2a] border-[#4f6eff] text-[#e8e8f0]"
                      : "border-transparent text-[#8888aa] hover:bg-[#1e1e2a] hover:text-[#e8e8f0]"
                  }`}
                >
                  <span className="text-sm">💬</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {t.title || t.documents?.file_name || "New chat"}
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
            activeId={filterDoc?.id ?? null}
            deletingIds={deletingIds}
            onDelete={handleDeleteDocument}
            onRetry={(doc) => driveProcessing(doc, upsertDocument, true)}
          />
        </div>

        {/* ── Footer: Upload + Storage Metrics ── */}
        <div className="mt-auto pt-3 border-t border-white/[0.07] flex flex-col gap-3">
          <button
            onClick={() => setUploadOpen(true)}
            disabled={!threadId}
            className="flex items-center justify-center gap-2 w-full px-3.5 py-2.5 rounded-xl border border-dashed border-[#4f6eff]/35 text-sm font-medium text-[#4f6eff] hover:bg-[#4f6eff]/[0.07] hover:border-[#4f6eff] transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload document
          </button>

          <div className="bg-[#1a1a26] border border-white/[0.05] rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#555570]">Storage and metrics</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Your vectors", stats ? stats.userVectors.toLocaleString() : "—"],
                ["Your documents", stats ? stats.documentCount.toLocaleString() : "—"],
                ["Dimensions", stats ? stats.dimension : "—"],
                ["Last upload", documents[0]?.file_size_bytes ? formatBytes(documents[0].file_size_bytes) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[10.5px] text-[#555570]">{label}</span>
                  <span className="text-sm font-semibold text-[#e8e8f0]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-7 py-3 border-b border-white/[0.07] bg-[#16161e] flex-shrink-0">
          <h1 className="text-[17px] font-semibold text-[#e8e8f0] tracking-tight">Ask your knowledge base</h1>
          {/* Filters are the namespace router, part of demo stage 2. */}
          {DEMO_STAGE >= 2 && <div className="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label="Search filters">
            <span className="text-[11px] text-[#555570]">Search in</span>
            <select aria-label="Collection" className={selectClass} value={filter.collection}
              onChange={(e) => setFilter({ collection: e.target.value, year: "", docId: "" })}>
              <option value="">All collections</option>
              {collections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Year" className={selectClass} value={filter.year}
              onChange={(e) => setFilter((f) => ({ ...f, year: e.target.value, docId: "" }))}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select aria-label="Document" className={selectClass} value={filter.docId}
              onChange={(e) => setFilter((f) => ({ ...f, docId: e.target.value }))}>
              <option value="">All documents</option>
              {docOptions.map((d) => <option key={d.id} value={d.document_id}>{d.file_name}</option>)}
            </select>
          </div>}
        </header>
        {initialLoaded ? (
          <ChatShell
            key={resetKey}
            threadId={threadId}
            initialMessages={initialMessages}
            filters={filters}
            onSent={(text) => touchThread(threadId, { title: text.slice(0, 60) })}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <span className="spinner" />
            <p className="text-sm text-[#8888aa]">Loading conversation…</p>
          </div>
        )}
      </main>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        collections={collections}
        threadId={threadId}
        onDocument={handleDocument}
      />
    </div>
  );
}
