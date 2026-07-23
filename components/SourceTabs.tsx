"use client";

import type { ImageSource } from "@/lib/types";

interface Props {
  sources: ImageSource[];
  activeSourceId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function SourceTabs({
  sources,
  activeSourceId,
  onActivate,
  onClose,
}: Props) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-2 pt-1">
      {sources.map((src) => {
        const active = src.id === activeSourceId;
        return (
          <div
            key={src.id}
            className={`flex items-center gap-2 rounded-t border border-b-0 px-2 py-1 text-sm ${
              active
                ? "border-slate-700 bg-slate-900 text-slate-100"
                : "border-transparent text-slate-400 hover:bg-slate-900/50"
            }`}
          >
            <button
              type="button"
              onClick={() => onActivate(src.id)}
              className="flex min-w-0 items-center gap-1.5"
              title={src.id}
            >
              <span aria-hidden>{src.kind === "folder" ? "📁" : "🖼️"}</span>
              <span className="max-w-40 truncate">{src.name}</span>
              <span className="text-[11px] text-slate-500">
                ({src.images.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => onClose(src.id)}
              aria-label={`Close ${src.name}`}
              title={`Close ${src.name}`}
              className="rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
