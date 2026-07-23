"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FsEntry, FsListing } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  onLoadImage: (entry: FsEntry, listing: FsListing) => void;
  onLoadFolder: (entry: FsEntry) => void;
  onLoadLabel: (entry: FsEntry) => void;
}

const ICON: Record<FsEntry["type"], string> = {
  dir: "📁",
  image: "🖼️",
  json: "🏷️",
  other: "📄",
};

async function fetchListing(path: string | null): Promise<FsListing> {
  const url = path ? `/api/fs?path=${encodeURIComponent(path)}` : "/api/fs";
  const res = await fetch(url);
  if (!res.ok)
    throw new Error((await res.json()).error ?? "Failed to list directory");
  return res.json();
}

export function FileBrowser({ onLoadImage, onLoadFolder, onLoadLabel }: Props) {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const navigate = useCallback(async (path: string | null) => {
    setLoading(true);
    setError(null);
    setHighlighted(null);
    try {
      setListing(await fetchListing(path));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    navigate(null);
  }, [navigate]);

  // Double-click: open a folder, or load a file (image/label).
  const onRowActivate = (entry: FsEntry) => {
    if (entry.type === "dir") navigate(entry.path);
    else if (entry.type === "image" && listing) onLoadImage(entry, listing);
    else if (entry.type === "json") onLoadLabel(entry);
  };

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-background text-foreground">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && navigate(listing.parent)}
        >
          ↑ Up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(null)}
        >
          Home
        </Button>
      </div>
      <div
        className="truncate px-3 py-1 font-mono text-[11px] text-muted-foreground"
        title={listing?.path}
      >
        {listing?.path ?? "…"}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
        {loading && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
        )}
        <ul className="py-1">
          {listing?.entries.map((entry) => (
            <li key={entry.path}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setHighlighted(entry.path)}
                    onDoubleClick={() => onRowActivate(entry)}
                    onContextMenu={() => setHighlighted(entry.path)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      highlighted === entry.path &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <span aria-hidden>{ICON[entry.type]}</span>
                    <span className="truncate">{entry.name}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {entry.type === "image" && (
                    <ContextMenuItem
                      onSelect={() => listing && onLoadImage(entry, listing)}
                    >
                      Load image
                    </ContextMenuItem>
                  )}
                  {entry.type === "dir" && (
                    <>
                      <ContextMenuItem onSelect={() => navigate(entry.path)}>
                        Open folder
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onLoadFolder(entry)}>
                        Load folder
                      </ContextMenuItem>
                    </>
                  )}
                  {entry.type === "json" && (
                    <ContextMenuItem onSelect={() => onLoadLabel(entry)}>
                      Load label
                    </ContextMenuItem>
                  )}
                  {entry.type === "other" && (
                    <ContextMenuItem disabled>No actions</ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Double-click: open / load · right-click: actions
      </p>
    </div>
  );
}
