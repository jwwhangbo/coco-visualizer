"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { useCallback, useEffect, useState } from "react";
import type { FsEntry, FsListing } from "@/lib/types";

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
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <button
          type="button"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && navigate(listing.parent)}
          className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-800"
        >
          ↑ Up
        </button>
        <button
          type="button"
          onClick={() => navigate(null)}
          className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
        >
          Home
        </button>
      </div>
      <div
        className="truncate px-3 py-1 font-mono text-[11px] text-slate-500"
        title={listing?.path}
      >
        {listing?.path ?? "…"}
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="px-3 py-2 text-xs text-red-400">{error}</p>}
        {loading && (
          <p className="px-3 py-2 text-xs text-slate-500">Loading…</p>
        )}
        <ul className="py-1">
          {listing?.entries.map((entry) => (
            <li key={entry.path}>
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>
                  <button
                    type="button"
                    onClick={() => setHighlighted(entry.path)}
                    onDoubleClick={() => onRowActivate(entry)}
                    onContextMenu={() => setHighlighted(entry.path)}
                    className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-slate-800 ${
                      highlighted === entry.path ? "bg-slate-800" : ""
                    }`}
                  >
                    <span aria-hidden>{ICON[entry.type]}</span>
                    <span className="truncate">{entry.name}</span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="z-50 min-w-40 rounded-md border border-slate-700 bg-slate-900 p-1 text-sm text-slate-100 shadow-xl">
                    {entry.type === "image" && (
                      <MenuItem
                        onSelect={() => listing && onLoadImage(entry, listing)}
                      >
                        Load image
                      </MenuItem>
                    )}
                    {entry.type === "dir" && (
                      <>
                        <MenuItem onSelect={() => navigate(entry.path)}>
                          Open folder
                        </MenuItem>
                        <MenuItem onSelect={() => onLoadFolder(entry)}>
                          Load folder
                        </MenuItem>
                      </>
                    )}
                    {entry.type === "json" && (
                      <MenuItem onSelect={() => onLoadLabel(entry)}>
                        Load label
                      </MenuItem>
                    )}
                    {entry.type === "other" && (
                      <ContextMenu.Item
                        disabled
                        className="px-3 py-1.5 text-slate-500 opacity-60"
                      >
                        No actions
                      </ContextMenu.Item>
                    )}
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
        Double-click: open / load · right-click: actions
      </p>
    </div>
  );
}

function MenuItem({
  children,
  onSelect,
}: {
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-3 py-1.5 outline-none data-[highlighted]:bg-slate-700"
    >
      {children}
    </ContextMenu.Item>
  );
}
