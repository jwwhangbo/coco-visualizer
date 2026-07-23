"use client";

import { ScrollArea } from "@radix-ui/react-scroll-area";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import DragSelect from "dragselect";
import { useEffect, useRef } from "react";
import { colorForCategory } from "@/lib/colors";
import type {
  GeometryMode,
  LabelSource,
  NormalizedAnnotation,
} from "@/lib/types";

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
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-sm">
        <span className="font-medium">Labels ({annotations.length})</span>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => onSetAll(true)}
            className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onSetAll(false)}
            className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
          >
            None
          </button>
        </div>
      </div>

      <div className="border-b border-slate-800 px-3 py-2 text-xs">
        <span className="text-slate-500">Loaded from</span>
        {labelSources.length === 0 ? (
          <p className="mt-1 text-slate-600">No labels loaded.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {labelSources.map((src) => (
              <li
                key={src.path}
                className="flex items-center gap-1.5 text-slate-300"
              >
                <span aria-hidden>{src.kind === "folder" ? "📁" : "🏷️"}</span>
                <span className="min-w-0 flex-1 truncate" title={src.path}>
                  {src.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(src.path)}
                  title={`Remove ${src.name}`}
                  aria-label={`Remove ${src.name}`}
                  className="shrink-0 rounded px-1 text-slate-500 hover:bg-slate-800 hover:text-red-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
        <span>Show</span>
        <Select.Root
          value={geometry}
          onValueChange={(v) => onGeometry(v as GeometryMode)}
        >
          <Select.Trigger className="inline-flex flex-1 items-center justify-between gap-1 rounded border border-slate-700 px-2 py-1 text-slate-100">
            <Select.Value />
            <Select.Icon>▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="z-50 rounded border border-slate-700 bg-slate-900 text-slate-100 shadow-xl">
              <Select.Viewport className="p-1">
                {(["both", "bbox", "seg"] as const).map((mode) => (
                  <Select.Item
                    key={mode}
                    value={mode}
                    className="cursor-pointer rounded px-6 py-1 outline-none data-[highlighted]:bg-slate-700"
                  >
                    <Select.ItemText>{GEOMETRY_LABELS[mode]}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
        {annotations.length === 0 && (
          <p className="px-3 py-3 text-xs text-slate-500">
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
                className={`flex items-center gap-2 border-b border-slate-900 px-3 py-2 text-sm ${
                  selected ? "bg-sky-900/60 ring-1 ring-inset ring-sky-500" : ""
                }`}
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
                  <span className="ml-1 text-[11px] text-slate-500">
                    #{ann.displayId} · {kind}
                  </span>
                </button>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onDelete(ann.id)}
                  title="Delete annotation"
                  aria-label={`Delete ${ann.categoryName} #${ann.displayId}`}
                  className="text-slate-500 hover:text-red-300"
                >
                  🗑
                </button>

                <span onPointerDown={(e) => e.stopPropagation()}>
                  <Switch.Root
                    checked={visible}
                    onCheckedChange={(v) => onToggle(ann.id, v)}
                    className="relative block h-5 w-9 shrink-0 rounded-full bg-slate-700 data-[state=checked]:bg-emerald-600"
                  >
                    <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                </span>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          title={dirty ? "Save deletions to disk" : "No unsaved changes"}
          className="w-full rounded border border-slate-700 py-1.5 text-sm enabled:bg-sky-700 enabled:text-white enabled:hover:bg-sky-600 disabled:cursor-not-allowed disabled:text-slate-500 disabled:opacity-60"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
