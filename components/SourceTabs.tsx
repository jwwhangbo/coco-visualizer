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
    <div className="flex items-stretch gap-1 overflow-x-auto bg-background px-2 pt-1">
      {sources.map((src) => {
        const active = src.id === activeSourceId;
        return (
          <div
            key={src.id}
            className={`flex items-center gap-2 rounded-t border border-b-0 px-2 py-1 text-sm ${
              active
                ? "border-border bg-card text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50"
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
              <span className="text-[11px] text-muted-foreground">
                ({src.images.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => onClose(src.id)}
              aria-label={`Close ${src.name}`}
              title={`Close ${src.name}`}
              className="rounded px-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
