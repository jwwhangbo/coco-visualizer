"use client";

import { useEffect, useState } from "react";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ViewMode } from "@/lib/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { GridViewIcon, SquareIcon } from "@hugeicons/core-free-icons";

export const PAGE_SIZES = [20, 40, 60] as const;
export const GRID_ZOOM_MIN = 50;
export const GRID_ZOOM_MAX = 250;

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
  gridZoom: number;
  onGridZoom: (zoom: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  selectedImageCount: number;
  onClearImageSelection: () => void;
  onExport: () => void;
  exporting: boolean;
}

/** Editable current-page field: commits a clamped page on Enter or blur. */
function PageInput({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const [text, setText] = useState(String(page));
  // Re-seed when the page changes from outside (Prev/Next, arrows, page-size).
  useEffect(() => setText(String(page)), [page]);

  const commit = () => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n)) {
      const clamped = Math.min(Math.max(1, n), pageCount);
      onPage(clamped);
      setText(String(clamped));
    } else {
      setText(String(page));
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Jump to page"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={commit}
      className="h-7 w-12 rounded-md border border-input bg-transparent px-2 text-center text-xs tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
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
  gridZoom,
  onGridZoom,
  canUndo,
  onUndo,
  selectedImageCount,
  onClearImageSelection,
  onExport,
  exporting,
}: Props) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-2 text-sm text-foreground">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={viewMode}
        onValueChange={(v) => v && onViewMode(v as ViewMode)}
      >
        <ToggleGroupItem value="single" title="Single view">
          <HugeiconsIcon icon={SquareIcon} />
          <span className="relative top-px">Single</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="grid"
          disabled={!gridEnabled}
          title={
            gridEnabled ? "Grid view" : "Grid unavailable for a single image"
          }
        >
          <HugeiconsIcon icon={GridViewIcon} />
          <span className="relative top-px">Grid</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <span className="text-xs text-muted-foreground">{imageCount} images</span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo delete (Ctrl+Z)"
      >
        ↺ Undo
      </Button>

      {viewMode === "grid" && selectedImageCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {selectedImageCount} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearImageSelection}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export ZIP"}
          </Button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {viewMode === "grid" && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => onPageSize(Number(v))}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Zoom</span>
              <Slider
                className="w-24"
                min={GRID_ZOOM_MIN}
                max={GRID_ZOOM_MAX}
                step={10}
                value={[gridZoom]}
                onValueChange={(v) => onGridZoom(v[0])}
              />
              <span className="w-9 text-right tabular-nums text-foreground">
                {gridZoom}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
              >
                ‹ Prev
              </Button>
              <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <PageInput page={page} pageCount={pageCount} onPage={onPage} />/{" "}
                {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => onPage(page + 1)}
              >
                Next ›
              </Button>
            </div>
          </>
        )}
        <ModeToggle />
      </div>
    </div>
  );
}
