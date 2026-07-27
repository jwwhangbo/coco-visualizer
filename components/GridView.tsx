"use client";

import DragSelect from "dragselect";
import { useEffect, useRef, useState } from "react";
import type {
  DatasetImage,
  GeometryMode,
  NormalizedAnnotation,
} from "@/lib/types";
import { OverlaySvg } from "./OverlaySvg";

interface Props {
  images: DatasetImage[];
  annotationsByStem: Record<string, NormalizedAnnotation[]>;
  hidden: Record<string, boolean>;
  geometry: GeometryMode;
  page: number;
  /** Thumbnail zoom as a percent; 100% fits 5 columns to the container width. */
  zoom: number;
  onOpen: (image: DatasetImage) => void;
  selectedPaths: Set<string>;
  onSelectionChange: (selectedOnPage: string[], pagePaths: string[]) => void;
  /** A plain (non-drag, non-modifier) click on a cell, or `null` for empty space. */
  onImageClick: (path: string | null) => void;
}

// Grid spacing that must match the Tailwind classes below (gap-3 / p-3 = 12px).
const GRID_GAP = 12;
const GRID_PAD = 12;
// Columns at 100% zoom; the per-column width scales inversely with zoom.
const COLS_AT_100 = 5;

export function GridView({
  images,
  annotationsByStem,
  hidden,
  geometry,
  page,
  zoom,
  onOpen,
  selectedPaths,
  onSelectionChange,
  onImageClick,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Start each page at the top (covers both key- and toolbar-driven changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when `page` changes
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page]);

  // Track the body width so thumbnail size can be derived from it.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth - 2 * GRID_PAD);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const area = bodyRef.current;
    if (!area) return;
    const selectables = Array.from(
      area.querySelectorAll<HTMLElement>("[data-grid-image-path]"),
    );
    const ds = new DragSelect<HTMLElement>({
      area,
      selectables,
      draggability: false,
      usePointerEvents: true,
      selectedClass: "grid-image-selected",
      selectionThreshold: 0.15,
    });
    ds.setSelection(
      selectables.filter((el) =>
        selectedPaths.has(el.dataset.gridImagePath ?? ""),
      ),
      false,
    );

    // `isDragging` from the callback only means "moving elements" (needs
    // draggability); with draggability off it's always false, so it can't tell
    // a rubber-band select from a click. Track pointer travel instead: a near-
    // stationary press is a click, real movement is a rubber-band drag.
    let downX = 0;
    let downY = 0;
    const CLICK_SLOP = 6;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    area.addEventListener("pointerdown", onDown, true);

    ds.subscribe("callback", ({ items, event }) => {
      const pe = event as MouseEvent | undefined;
      const mod = !!pe && (pe.ctrlKey || pe.metaKey || pe.shiftKey);
      const moved = pe
        ? Math.hypot(pe.clientX - downX, pe.clientY - downY)
        : 0;
      // A plain click (no rubber-band drag, no modifier) toggles just the
      // clicked image in/out of the selection, leaving the rest intact; an
      // empty-space click (no item) clears it. Drags and modifier-clicks keep
      // the additive merge behavior below.
      if (moved < CLICK_SLOP && !mod) {
        const clicked =
          items.length === 1 ? (items[0].dataset.gridImagePath ?? null) : null;
        onImageClick(clicked);
        return;
      }
      onSelectionChange(
        items
          .map((el) => el.dataset.gridImagePath)
          .filter((p): p is string => !!p),
        images.map((image) => image.path),
      );
    });
    return () => {
      area.removeEventListener("pointerdown", onDown, true);
      ds.stop();
    };
  }, [images, onSelectionChange, onImageClick, selectedPaths]);

  // At 100% zoom, COLS_AT_100 columns exactly fill the content width; raising the
  // zoom grows each column (and drops the column count) proportionally.
  const baseCol =
    containerWidth > 0
      ? (containerWidth - (COLS_AT_100 - 1) * GRID_GAP) / COLS_AT_100
      : 0;
  const col = baseCol > 0 ? Math.max(40, (baseCol * zoom) / 100) : null;
  const gridTemplateColumns = col
    ? `repeat(auto-fill, minmax(${col}px, 1fr))`
    : "repeat(auto-fill, minmax(220px, 1fr))";

  return (
    <div
      ref={bodyRef}
      style={{ gridTemplateColumns }}
      className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto p-3"
    >
      {images.map((image) => (
        <GridCell
          key={image.path}
          image={image}
          annotations={annotationsByStem[image.stem] ?? []}
          hidden={hidden}
          geometry={geometry}
          onOpen={onOpen}
          selected={selectedPaths.has(image.path)}
        />
      ))}
    </div>
  );
}

function GridCell({
  image,
  annotations,
  hidden,
  geometry,
  onOpen,
  selected,
}: {
  image: DatasetImage;
  annotations: NormalizedAnnotation[];
  hidden: Record<string, boolean>;
  geometry: GeometryMode;
  onOpen: (image: DatasetImage) => void;
  selected: boolean;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  return (
    <button
      type="button"
      data-grid-image-path={image.path}
      aria-pressed={selected}
      onDoubleClick={() => onOpen(image)}
      className="group relative flex flex-col overflow-hidden rounded border border-border bg-card text-left hover:border-ring aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/50 select-none"
    >
      <div className="relative aspect-[4/3] bg-[#111]">
        {/* biome-ignore lint/performance/noImgElement: raw local file, not a web asset */}
        <img
          src={`/api/image?path=${encodeURIComponent(image.path)}`}
          alt={image.name}
          loading="lazy"
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          className="absolute inset-0 h-full w-full object-contain"
        />
        {natural && (
          <OverlaySvg
            width={natural.w}
            height={natural.h}
            annotations={annotations}
            hidden={hidden}
            geometry={geometry}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="truncate">{image.name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {annotations.length}
        </span>
      </div>
      <span className="pointer-events-none absolute top-2 right-2 flex size-5 items-center justify-center rounded-full border bg-background/80 text-xs opacity-0 shadow-sm group-aria-pressed:opacity-100">
        ✓
      </span>
    </button>
  );
}
