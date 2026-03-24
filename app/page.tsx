"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatShell } from "@/components/chat/ChatShell";
import { UploadButton } from "@/components/chat/UploadButton";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function generateThreadId() {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface DocInfo { fileName: string; chunkCount: number; fileSizeBytes?: number; }
interface ThreadInfo {
  id: string;
  updated_at: string;
  documents: { file_name: string; chunk_count: number } | null;
}
interface IndexStats { totalVectors: number; userVectors: number; dimension: number; }

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export default function Home() {
  const [threadId, setThreadId] = useState<string>(generateThreadId);
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [userEmail, setUserEmail] = useState("");
  const [pastThreads, setPastThreads] = useState<ThreadInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load stats
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/pinecone-stats");
      if (res.ok) setStats(await res.json());
    } catch { /* best effort */ }
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || "");
      try {
        const res = await fetch("/api/threads");
        if (!res.ok) return;
        const data = await res.json();
        if (data.threads?.length > 0) {
          setPastThreads(data.threads);
          const latest = data.threads[0];
          setThreadId(latest.id);
          setResetKey((k) => k + 1);
          if (latest.documents) {
            setDocInfo({ fileName: latest.documents.file_name, chunkCount: latest.documents.chunk_count });
          }
        }
      } catch (e) { console.error(e); }
      refreshStats();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploadSuccess = useCallback((fileName: string, chunkCount: number, fileSizeBytes?: number, indexStats?: IndexStats) => {
    setDocInfo({ fileName, chunkCount, fileSizeBytes });
    if (indexStats) setStats(indexStats);
    else refreshStats();
  }, [refreshStats]);

  const handleNewThread = () => {
    fetch("/api/clear-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    }).catch(console.error);
    setThreadId(generateThreadId());
    setDocInfo(null);
    setResetKey((k) => k + 1);
  };

  const handleSwitchThread = (t: ThreadInfo) => {
    setThreadId(t.id);
    setResetKey((k) => k + 1);
    setDocInfo(t.documents ? { fileName: t.documents.file_name, chunkCount: t.documents.chunk_count } : null);
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

        {/* Document info */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-[#555570]">Document</p>
          {docInfo ? (
            <div className="flex items-start gap-2.5 p-3 bg-[#1e1e2a] border border-white/[0.07] rounded-xl">
              <span className="text-xl flex-shrink-0">📄</span>
              <div className="overflow-hidden">
                <p className="text-[13px] font-medium text-[#e8e8f0] overflow-hidden text-ellipsis whitespace-nowrap" title={docInfo.fileName}>
                  {docInfo.fileName}
                </p>
                <p className="text-[11px] text-[#8888aa] mt-0.5">{docInfo.chunkCount} chunks indexed</p>
                {docInfo.fileSizeBytes && (
                  <p className="text-[11px] text-[#555570] mt-0.5">File size: {formatBytes(docInfo.fileSizeBytes)}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#555570] italic">No document uploaded yet.</p>
          )}
        </div>

        {/* ── Footer: Upload + Storage Metrics + User ── */}
        <div className="mt-auto pt-3 border-t border-white/[0.07] flex flex-col gap-3">
          <UploadButton threadId={threadId} onUploadSuccess={handleUploadSuccess} />

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
                <span className="text-[10.5px] text-[#555570]">Index Total</span>
                <span className="text-sm font-semibold text-[#e8e8f0]">
                  {stats ? stats.totalVectors.toLocaleString() : "—"}
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
                  {docInfo?.fileSizeBytes ? formatBytes(docInfo.fileSizeBytes) : "—"}
                </span>
              </div>
            </div>

            {/* Usage bar */}
            {stats && stats.userVectors > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-[#8888aa]">Your usage</span>
                  <span className="text-[#6381ff] font-medium">
                    {stats.totalVectors > 0 ? ((stats.userVectors / stats.totalVectors) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#0f0f13] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#4f6eff] to-[#8ba0ff] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((stats.userVectors / Math.max(stats.totalVectors, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
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
            {docInfo && (
              <span className="text-xs px-2.5 py-1 bg-[#4f6eff]/15 border border-[#4f6eff]/30 rounded-full text-[#8ba0ff] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                {docInfo.fileName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#555570]">Thread</span>
            <code className="text-[11px] px-2 py-0.5 bg-[#1e1e2a] border border-white/[0.07] rounded-md text-[#8888aa] font-mono">
              {threadId.split("_").slice(-1)[0]}
            </code>
          </div>
        </header>
        <ChatShell key={resetKey} threadId={threadId} />
      </main>
    </div>
  );
}
