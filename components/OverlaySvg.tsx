"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useState } from "react";
import { colorForCategory } from "@/lib/colors";
import type { GeometryMode, NormalizedAnnotation } from "@/lib/types";

interface Props {
  width: number;
  height: number;
  annotations: NormalizedAnnotation[];
  hidden: Record<string, boolean>;
  geometry?: GeometryMode;
  interactive?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, additive: boolean) => void;
  onDeleteAnn?: (id: string) => void;
}

export function OverlaySvg({
  width,
  height,
  annotations,
  hidden,
  geometry = "both",
  interactive = false,
  selectedIds,
  onSelect,
  onDeleteAnn,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const visible = annotations.filter((a) => !hidden[a.id]);
  const showBbox = geometry !== "seg";
  const showSeg = geometry !== "bbox";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
    >
      <title>Annotation overlay</title>
      {visible.map((ann) => {
        const color = colorForCategory(ann.categoryId);
        const active = selectedIds?.has(ann.id) === true || ann.id === hoverId;
        const shape = (
          <>
            <title>{`${ann.categoryName} #${ann.displayId}`}</title>
            {showBbox && ann.bbox && (
              <rect
                x={ann.bbox[0]}
                y={ann.bbox[1]}
                width={ann.bbox[2]}
                height={ann.bbox[3]}
                fill={active ? color : "transparent"}
                fillOpacity={active ? 0.15 : 0}
                stroke={color}
                strokeWidth={active ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {showSeg &&
              ann.polygons.map((poly, i) => (
                <polygon
                  // biome-ignore lint/suspicious/noArrayIndexKey: polygons are positional
                  key={i}
                  points={pointsOf(poly)}
                  fill={color}
                  fillOpacity={active ? 0.35 : 0.18}
                  stroke={color}
                  strokeWidth={active ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </>
        );

        if (!interactive) {
          return <g key={ann.id}>{shape}</g>;
        }

        return (
          <ContextMenu.Root key={ann.id}>
            <ContextMenu.Trigger asChild>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG overlay shape; selection is pointer/keyboard-driven, keyboard delete is handled globally */}
              <g
                onPointerEnter={() => setHoverId(ann.id)}
                onPointerLeave={() =>
                  setHoverId((h) => (h === ann.id ? null : h))
                }
                onClick={(e) => onSelect?.(ann.id, e.ctrlKey || e.metaKey)}
                style={{ cursor: "pointer" }}
              >
                {shape}
              </g>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="z-50 min-w-40 rounded-md border border-slate-700 bg-slate-900 p-1 text-sm text-slate-100 shadow-xl">
                <ContextMenu.Item
                  onSelect={() => onDeleteAnn?.(ann.id)}
                  className="cursor-pointer rounded px-3 py-1.5 outline-none text-red-300 data-[highlighted]:bg-red-900/60"
                >
                  Delete annotation
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </svg>
  );
}

function pointsOf(flat: number[]): string {
  let out = "";
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out += `${flat[i]},${flat[i + 1]} `;
  }
  return out.trim();
}
