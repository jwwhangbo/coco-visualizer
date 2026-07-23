"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DatasetImage,
  GeometryMode,
  NormalizedAnnotation,
} from "@/lib/types";
import { OverlaySvg } from "./OverlaySvg";

interface Props {
  image: DatasetImage;
  annotations: NormalizedAnnotation[];
  hidden: Record<string, boolean>;
  geometry: GeometryMode;
  selectedIds: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
  onDeleteAnn: (id: string) => void;
  /** Move to the previous/next image (delta -1 / +1). */
  onStepImage: (delta: number) => void;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function ImageViewer({
  image,
  annotations,
  hidden,
  geometry,
  selectedIds,
  onSelect,
  onDeleteAnn,
  onStepImage,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stepRef = useRef(onStepImage);
  stepRef.current = onStepImage;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  const fit = useCallback((nat: { w: number; h: number }) => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / nat.w, ch / nat.h) * 0.95;
    setTransform({
      scale,
      tx: (cw - nat.w * scale) / 2,
      ty: (ch - nat.h * scale) / 2,
    });
  }, []);

  const applyNatural = useCallback(
    (el: HTMLImageElement) => {
      if (!el.naturalWidth) return;
      const nat = { w: el.naturalWidth, h: el.naturalHeight };
      setNatural(nat);
      fit(nat);
    },
    [fit],
  );

  // The <img> element is reused across image changes (no key remount), so reset
  // the view when the image changes and re-sync from the element. Reusing the
  // element avoids Chromium painting a cached src blank on a fresh <img>.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync when the image changes
  useEffect(() => {
    setNatural(null);
    setTransform({ scale: 1, tx: 0, ty: 0 });
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth) applyNatural(el);
  }, [image.path, applyNatural]);

  // Native wheel listener so preventDefault works. Ctrl+wheel zooms toward the
  // cursor; a plain wheel steps between images.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setTransform((t) => {
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const scale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
          const k = scale / t.scale;
          return { scale, tx: cx - (cx - t.tx) * k, ty: cy - (cy - t.ty) * k };
        });
      } else {
        stepRef.current(e.deltaY > 0 ? 1 : -1);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.tx,
      ty: transform.ty,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setTransform((t) => ({ ...t, tx: start.tx + dx, ty: start.ty + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-xs text-slate-400">
        <span className="truncate">{image.name}</span>
        <span className="ml-auto hidden text-[11px] text-slate-500 sm:inline">
          scroll: change image · ctrl+scroll: zoom
        </span>
        <span className="tabular-nums">
          {Math.round(transform.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => natural && fit(natural)}
          className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
        >
          Fit
        </button>
      </div>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-[#111] active:cursor-grabbing"
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            width: natural?.w,
            height: natural?.h,
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: raw local file, not a web asset */}
          <img
            ref={imgRef}
            src={`/api/image?path=${encodeURIComponent(image.path)}`}
            alt={image.name}
            draggable={false}
            onLoad={(e) => applyNatural(e.currentTarget)}
            className="block select-none"
            style={{ width: natural?.w, height: natural?.h }}
          />
          {natural && (
            <OverlaySvg
              width={natural.w}
              height={natural.h}
              annotations={annotations}
              hidden={hidden}
              geometry={geometry}
              interactive
              selectedIds={selectedIds}
              onSelect={onSelect}
              onDeleteAnn={onDeleteAnn}
            />
          )}
        </div>
      </div>
    </div>
  );
}
