"use client";

import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
          <ContextMenu key={ann.id}>
            <ContextMenuTrigger asChild>
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
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => onDeleteAnn?.(ann.id)}
              >
                Delete annotation
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
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
