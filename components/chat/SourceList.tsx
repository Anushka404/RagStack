"use client";

import { SourceRef } from "@/types/chat";

interface SourceListProps {
  sources: SourceRef[];
}

export function SourceList({ sources }: SourceListProps) {
  if (!sources || sources.length === 0) return null;

  const byFile = sources.reduce<Record<string, SourceRef[]>>((acc, src) => {
    if (!acc[src.fileName]) acc[src.fileName] = [];
    acc[src.fileName].push(src);
    return acc;
  }, {});

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {Object.entries(byFile).map(([fileName, refs]) => {
        const pages = [...new Set(refs.map((r) => r.pageNumber).filter(Boolean))].sort(
          (a, b) => (a as number) - (b as number)
        );
        const label = pages.length > 0 ? `${fileName} — p. ${pages.join(", ")}` : fileName;

        return (
          <span
            key={fileName}
            title={refs[0]?.textPreview || ""}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#4f6eff]/10 border border-[#4f6eff]/20 rounded-full text-[11.5px] text-[#8ba0ff] max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap hover:bg-[#4f6eff]/18 transition cursor-default"
          >
            📄 {label}
          </span>
        );
      })}
    </div>
  );
}
