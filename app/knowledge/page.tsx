"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { UploadDialog } from "@/components/upload/UploadDialog";
import { NodeDetail, type Selection } from "@/components/knowledge/NodeDetail";
import { driveProcessing, IN_PROGRESS } from "@/lib/client/processing";
import { plural } from "@/lib/client/format";
import type { ChunkRow, DocumentRow } from "@/types/documents";

interface IndexStats { userVectors: number; documentCount: number; dimension: number; }

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
}

function TreeRow({ depth, icon, label, meta, expandable, expanded, selected, onClick }: {
  depth: number; icon: string; label: string; meta?: string;
  expandable?: boolean; expanded?: boolean; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expandable ? expanded : undefined}
      style={{ paddingLeft: 8 + depth * 18 }}
      className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-left text-[13px] transition ${
        selected ? "bg-[#4f6eff]/15 text-[#c4ceff]" : "text-[#d0d0e0] hover:bg-white/[0.04]"
      }`}
    >
      <span className="w-3 text-[#555570] text-[10px]">{expandable ? (expanded ? "▼" : "▶") : ""}</span>
      <span aria-hidden="true">{icon}</span>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      {meta && <span className="ml-auto pl-2 text-[11px] text-[#555570] whitespace-nowrap">{meta}</span>}
    </button>
  );
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [chunksByDoc, setChunksByDoc] = useState<Record<string, ChunkRow[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const upsertDocument = useCallback((doc: DocumentRow) => {
    setDocuments((prev) =>
      prev.some((d) => d.id === doc.id) ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev]
    );
    // Chunks are stored batch by batch, so a document that is still processing gets refetched later.
    if (doc.status === "ready") {
      setChunksByDoc((prev) => ({ ...prev, [doc.id]: undefined }));
      fetch("/api/pinecone-stats").then((r) => (r.ok ? r.json() : null)).then((s) => s && setStats(s)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetch("/api/pinecone-stats").then((r) => (r.ok ? r.json() : null)).then((s) => s && setStats(s)).catch(() => {});
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => {
        const docs: DocumentRow[] = data.documents ?? [];
        setDocuments(docs);
        // Open the first collection so the tree isn't a single closed row.
        if (docs[0]) setExpanded(new Set([`c:${docs[0].collection}`]));
        docs.filter((d) => IN_PROGRESS.includes(d.status)).forEach((d) => driveProcessing(d, upsertDocument));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [upsertDocument]);

  const loadChunks = useCallback(async (docId: string) => {
    const res = await fetch(`/api/documents/${docId}/chunks`);
    const data = await res.json().catch(() => ({}));
    setChunksByDoc((prev) => ({ ...prev, [docId]: data.chunks ?? [] }));
  }, []);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const tree = useMemo(() => {
    const byCollection = groupBy(documents, (d) => d.collection);
    return [...byCollection.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collection, docs]) => ({
        collection,
        docs,
        years: [...groupBy(docs, (d) => d.year).entries()]
          // Newest year first; documents without a year last.
          .sort(([a], [b]) => (b ?? -1) - (a ?? -1))
          .map(([year, yearDocs]) => ({ year, docs: yearDocs.sort((a, b) => a.file_name.localeCompare(b.file_name)) })),
      }));
  }, [documents]);

  const handleDelete = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete "${doc.file_name}"? Its vectors and chunks are removed and it will no longer be used to answer questions.`)) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed");
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setSelection(null);
      fetch("/api/pinecone-stats").then((r) => (r.ok ? r.json() : null)).then((s) => s && setStats(s)).catch(() => {});
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const ready = documents.filter((d) => d.status === "ready");
  const metrics = [
    ["Collections", new Set(documents.map((d) => d.collection)).size],
    ["Documents", documents.length],
    ["Chunks", ready.reduce((n, d) => n + d.chunk_count, 0).toLocaleString()],
    ["Vectors", stats ? stats.userVectors.toLocaleString() : "—"],
    ["Embedding", stats ? `${stats.dimension}-d` : "—"],
  ];
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(selection);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0f0f13] text-[#e8e8f0]">
      <AppNav />
      <main className="flex-1 overflow-y-auto px-7 py-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold">Knowledge base</h1>
              <p className="text-sm text-[#8888aa]">Every document, grouped the way retrieval can filter it: collection, year, document, page, chunk.</p>
            </div>
            <button
              onClick={() => setUploadOpen(true)}
              className="ml-auto px-4 py-2 bg-[#4f6eff] hover:bg-[#6381ff] text-white text-sm font-semibold rounded-xl transition"
            >
              Upload document
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {metrics.map(([label, value]) => (
              <div key={label} className="bg-[#16161e] border border-white/[0.05] rounded-xl px-4 py-3">
                <p className="text-xs text-[#8888aa]">{label}</p>
                <p className="text-xl font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
            <div className="bg-[#16161e] border border-white/[0.05] rounded-xl p-2 min-h-[300px]">
              {!loaded ? (
                <p className="p-3 text-sm text-[#8888aa]">Loading…</p>
              ) : tree.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="font-medium">Start your knowledge base</p>
                  <p className="text-sm text-[#8888aa] mt-1">Upload a document and pick a collection to group it under.</p>
                </div>
              ) : (
                tree.map(({ collection, docs, years }) => {
                  const cKey = `c:${collection}`;
                  return (
                    <div key={cKey}>
                      <TreeRow depth={0} icon="📁" label={collection} meta={`${docs.length} doc${docs.length === 1 ? "" : "s"}`}
                        expandable expanded={expanded.has(cKey)} selected={isSel({ kind: "collection", collection })}
                        onClick={() => { toggle(cKey); setSelection({ kind: "collection", collection }); }} />
                      {expanded.has(cKey) && years.map(({ year, docs: yearDocs }) => {
                        const yKey = `${cKey}/y:${year}`;
                        return (
                          <div key={yKey}>
                            <TreeRow depth={1} icon="📅" label={year ? String(year) : "No year"} meta={`${yearDocs.length} doc${yearDocs.length === 1 ? "" : "s"}`}
                              expandable expanded={expanded.has(yKey)} selected={isSel({ kind: "year", collection, year })}
                              onClick={() => { toggle(yKey); setSelection({ kind: "year", collection, year }); }} />
                            {expanded.has(yKey) && yearDocs.map((doc) => {
                              const dKey = `d:${doc.id}`;
                              const chunks = chunksByDoc[doc.id];
                              const pages = chunks ? [...groupBy(chunks, (c) => c.page_number).entries()] : [];
                              return (
                                <div key={dKey}>
                                  <TreeRow depth={2} icon="📄" label={doc.file_name}
                                    meta={doc.status === "ready" ? plural(doc.chunk_count, "chunk")
                                      : doc.status === "failed" ? "failed"
                                      : doc.stats?.ocr ? `OCR ${doc.stats.ocr.done}/${doc.stats.ocr.pages}…`
                                      : `${doc.status}…`}
                                    expandable expanded={expanded.has(dKey)} selected={isSel({ kind: "document", docId: doc.id })}
                                    onClick={() => {
                                      toggle(dKey);
                                      setSelection({ kind: "document", docId: doc.id });
                                      if (!chunks) loadChunks(doc.id);
                                    }} />
                                  {expanded.has(dKey) && (
                                    !chunks ? <p className="pl-20 py-1 text-xs text-[#555570]">Loading chunks…</p>
                                    : chunks.length === 0 ? <p className="pl-20 py-1 text-xs text-[#555570]">No stored chunks. Documents uploaded before the knowledge base existed need re-uploading.</p>
                                    : pages.map(([page, pageChunks]) => {
                                      const pKey = `${dKey}/p:${page}`;
                                      return (
                                        <div key={pKey}>
                                          <TreeRow depth={3} icon="📃" label={`Page ${page ?? "?"}`} meta={`${pageChunks.length} chunk${pageChunks.length === 1 ? "" : "s"}`}
                                            expandable expanded={expanded.has(pKey)} selected={isSel({ kind: "page", docId: doc.id, page })}
                                            onClick={() => { toggle(pKey); setSelection({ kind: "page", docId: doc.id, page }); }} />
                                          {expanded.has(pKey) && pageChunks.map((c) => (
                                            <TreeRow key={c.id} depth={4} icon="🧩" label={`Chunk #${c.chunk_index}`} meta={`${c.content.length} chars`}
                                              selected={isSel({ kind: "chunk", docId: doc.id, chunkId: c.id })}
                                              onClick={() => setSelection({ kind: "chunk", docId: doc.id, chunkId: c.id })} />
                                          ))}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="bg-[#16161e] border border-white/[0.05] rounded-xl p-5 md:sticky md:top-0">
              <NodeDetail
                selection={selection}
                documents={documents}
                chunksByDoc={chunksByDoc}
                deletingId={deletingId}
                onDelete={handleDelete}
                onRetry={(doc) => driveProcessing(doc, upsertDocument, true)}
              />
            </div>
          </div>
        </div>
      </main>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        collections={[...new Set(documents.map((d) => d.collection))]}
        onDocument={(doc) => {
          upsertDocument(doc);
          setExpanded((prev) => new Set(prev).add(`c:${doc.collection}`).add(`c:${doc.collection}/y:${doc.year}`));
        }}
      />
    </div>
  );
}
