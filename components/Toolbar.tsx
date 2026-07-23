"use client";

import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
    <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-2 text-sm text-foreground">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={viewMode}
        onValueChange={(v) => v && onViewMode(v as ViewMode)}
      >
        <ToggleGroupItem value="single" title="Single view">
          ▭ Single
        </ToggleGroupItem>
        <ToggleGroupItem
          value="grid"
          disabled={!gridEnabled}
          title={
            gridEnabled ? "Grid view" : "Grid unavailable for a single image"
          }
        >
          ▦ Grid
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
              <span className="text-xs tabular-nums text-muted-foreground">
                {page} / {pageCount}
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
