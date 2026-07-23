"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
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
  pageCount: number;
  onPage: (page: number) => void;
  onOpen: (image: DatasetImage) => void;
}

// Fire at most one page flip per this window (ms), on the leading edge.
const PAGE_WHEEL_COOLDOWN = 100;

export function GridView({
  images,
  annotationsByStem,
  hidden,
  geometry,
  page,
  pageCount,
  onPage,
  onOpen,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Start each page at the top (covers both wheel- and toolbar-driven changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when `page` changes
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page]);

  const flipPage = useDebouncedCallback(
    (delta: number) => {
      const target = page + delta;
      if (target >= 1 && target <= pageCount) onPage(target);
    },
    PAGE_WHEEL_COOLDOWN,
    { leading: true, trailing: false },
  );

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = bodyRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    if (e.deltaY > 0 && atBottom) flipPage(1);
    else if (e.deltaY < 0 && atTop) flipPage(-1);
  };

  return (
    <div
      ref={bodyRef}
      onWheel={onWheel}
      className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto p-3"
    >
      {images.map((image) => (
        <GridCell
          key={image.path}
          image={image}
          annotations={annotationsByStem[image.stem] ?? []}
          hidden={hidden}
          geometry={geometry}
          onOpen={onOpen}
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
}: {
  image: DatasetImage;
  annotations: NormalizedAnnotation[];
  hidden: Record<string, boolean>;
  geometry: GeometryMode;
  onOpen: (image: DatasetImage) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  return (
    <button
      type="button"
      onClick={() => onOpen(image)}
      className="group flex flex-col overflow-hidden rounded border border-slate-800 bg-slate-900 text-left hover:border-slate-600"
    >
      <div className="relative aspect-[4/3] bg-[#111]">
        {/* biome-ignore lint/performance/noImgElement: raw local file, not a web asset */}
        <img
          src={`/api/image?path=${encodeURIComponent(image.path)}`}
          alt={image.name}
          loading="lazy"
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
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-slate-400">
        <span className="truncate">{image.name}</span>
        <span className="shrink-0 tabular-nums text-slate-500">
          {annotations.length}
        </span>
      </div>
    </button>
  );
}
