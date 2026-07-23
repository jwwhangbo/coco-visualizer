"use client";

import DragSelect from "dragselect";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { colorForCategory } from "@/lib/colors";
import type {
  GeometryMode,
  LabelSource,
  NormalizedAnnotation,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  annotations: NormalizedAnnotation[];
  hidden: Record<string, boolean>;
  geometry: GeometryMode;
  labelSources: LabelSource[];
  onGeometry: (mode: GeometryMode) => void;
  onRemoveSource: (path: string) => void;
  onToggle: (id: string, visible: boolean) => void;
  onSetAll: (visible: boolean) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  onSelectIds: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  dirty: boolean;
}

const GEOMETRY_LABELS: Record<GeometryMode, string> = {
  both: "Bbox + Seg",
  bbox: "Bbox only",
  seg: "Seg only",
};

export function AnnotationPanel({
  annotations,
  hidden,
  geometry,
  labelSources,
  onGeometry,
  onRemoveSource,
  onToggle,
  onSetAll,
  selectedIds,
  onSelect,
  onSelectIds,
  onDelete,
  onSave,
  dirty,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const dsRef = useRef<DragSelect<HTMLElement> | null>(null);
  // Keep the latest callback without re-creating the DragSelect instance.
  const onSelectIdsRef = useRef(onSelectIds);
  onSelectIdsRef.current = onSelectIds;

  // Create the rubber-band selector over the list once.
  useEffect(() => {
    const area = listRef.current;
    if (!area) return;
    const ds = new DragSelect<HTMLElement>({
      area,
      selectables: [],
      draggability: false,
    });
    ds.subscribe("DS:end", (e) => {
      const ids = (e.items ?? [])
        .map((el) => el.dataset.annId)
        .filter((id): id is string => Boolean(id));
      onSelectIdsRef.current(ids);
    });
    dsRef.current = ds;
    return () => {
      ds.stop();
      dsRef.current = null;
    };
  }, []);

  // Re-register selectable rows whenever the list changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-query the DOM rows when the annotation list changes
  useEffect(() => {
    const ds = dsRef.current;
    const area = listRef.current;
    if (!ds || !area) return;
    ds.setSettings({
      selectables: Array.from(
        area.querySelectorAll<HTMLElement>("[data-ann-id]"),
      ),
    });
  }, [annotations]);

  // Mirror the shared selection (which may change from image clicks) into
  // DragSelect so a following ctrl-drag extends from the right base.
  useEffect(() => {
    const ds = dsRef.current;
    const area = listRef.current;
    if (!ds || !area) return;
    const els = Array.from(
      area.querySelectorAll<HTMLElement>("[data-ann-id]"),
    ).filter((el) => el.dataset.annId && selectedIds.has(el.dataset.annId));
    ds.setSelection(els, false);
  }, [selectedIds]);

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
        <span className="font-medium">Labels ({annotations.length})</span>
        <div className="flex gap-1 text-xs">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onSetAll(true)}
          >
            All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onSetAll(false)}
          >
            None
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">Loaded from</span>
        {labelSources.length === 0 ? (
          <p className="mt-1 text-muted-foreground">No labels loaded.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {labelSources.map((src) => (
              <li key={src.path} className="flex items-center gap-1.5">
                <span aria-hidden>{src.kind === "folder" ? "📁" : "🏷️"}</span>
                <span className="min-w-0 flex-1 truncate" title={src.path}>
                  {src.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(src.path)}
                  title={`Remove ${src.name}`}
                  aria-label={`Remove ${src.name}`}
                  className="shrink-0 rounded px-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>Show</span>
        <Select
          value={geometry}
          onValueChange={(v) => onGeometry(v as GeometryMode)}
        >
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["both", "bbox", "seg"] as const).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {GEOMETRY_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {annotations.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No labels for this image.
          </p>
        )}
        <ul ref={listRef}>
          {annotations.map((ann) => {
            const visible = !hidden[ann.id];
            const kind =
              ann.polygons.length > 0 ? "seg" : ann.bbox ? "bbox" : "—";
            const selected = selectedIds.has(ann.id);
            return (
              <li
                key={ann.id}
                data-ann-id={ann.id}
                className={cn(
                  "flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm",
                  selected &&
                    "bg-accent text-accent-foreground ring-1 ring-inset ring-ring",
                )}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: colorForCategory(ann.categoryId) }}
                />
                <button
                  type="button"
                  onClick={(e) =>
                    onSelect(ann.id, e.ctrlKey || e.metaKey || e.shiftKey)
                  }
                  className="min-w-0 flex-1 truncate text-left"
                  title={`${ann.categoryName} #${ann.displayId}`}
                >
                  <span className="truncate">{ann.categoryName}</span>
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    #{ann.displayId} · {kind}
                  </span>
                </button>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onDelete(ann.id)}
                  title="Delete annotation"
                  aria-label={`Delete ${ann.categoryName} #${ann.displayId}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  🗑
                </button>

                <span onPointerDown={(e) => e.stopPropagation()}>
                  <Switch
                    checked={visible}
                    onCheckedChange={(v) => onToggle(ann.id, v)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <Button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          title={dirty ? "Save deletions to disk" : "No unsaved changes"}
          className="w-full"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
