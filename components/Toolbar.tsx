"use client";

import * as Select from "@radix-ui/react-select";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ViewMode } from "@/lib/types";

export const PAGE_SIZES = [20, 40, 60] as const;

interface Props {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  gridEnabled: boolean;
  imageCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  canUndo: boolean;
  onUndo: () => void;
}

/** Per-tab toolbar: single/grid toggle plus grid pagination. */
export function Toolbar({
  viewMode,
  onViewMode,
  gridEnabled,
  imageCount,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
  canUndo,
  onUndo,
}: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
      <ToggleGroup.Root
        type="single"
        value={viewMode}
        onValueChange={(v) => v && onViewMode(v as ViewMode)}
        className="inline-flex overflow-hidden rounded border border-slate-700 text-xs"
      >
        <ToggleGroup.Item
          value="single"
          title="Single view"
          className="px-2 py-1 data-[state=on]:bg-slate-700"
        >
          ▭ Single
        </ToggleGroup.Item>
        <ToggleGroup.Item
          value="grid"
          disabled={!gridEnabled}
          title={
            gridEnabled ? "Grid view" : "Grid unavailable for a single image"
          }
          className="border-l border-slate-700 px-2 py-1 disabled:opacity-30 data-[state=on]:bg-slate-700"
        >
          ▦ Grid
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <span className="text-xs text-slate-500">{imageCount} images</span>

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo delete (Ctrl+Z)"
        className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-30 hover:bg-slate-800"
      >
        ↺ Undo
      </button>

      {viewMode === "grid" && (
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Per page</span>
            <Select.Root
              value={String(pageSize)}
              onValueChange={(v) => onPageSize(Number(v))}
            >
              <Select.Trigger className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-100">
                <Select.Value />
                <Select.Icon>▾</Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="z-50 rounded border border-slate-700 bg-slate-900 text-slate-100 shadow-xl">
                  <Select.Viewport className="p-1">
                    {PAGE_SIZES.map((size) => (
                      <Select.Item
                        key={size}
                        value={String(size)}
                        className="cursor-pointer rounded px-6 py-1 outline-none data-[highlighted]:bg-slate-700"
                      >
                        <Select.ItemText>{size}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-800"
            >
              ‹ Prev
            </button>
            <span className="text-xs tabular-nums text-slate-400">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className="rounded border border-slate-700 px-2 py-1 text-xs disabled:opacity-40 hover:bg-slate-800"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
