// Client-safe geometry helpers for the cleanup tools (island / overlap removal).
// No node imports — safe to use from client components.

import type { MultiPolygon, Ring } from "polygon-clipping";
import polygonClipping from "polygon-clipping";
import type { NormalizedAnnotation } from "./types";

/** Which cleanup tool an action came from. */
export type CleanupKind = "islands" | "overlaps";

/** Run the cleanup of `kind` with its scalar parameter. */
export function runCleanup(
  kind: CleanupKind,
  anns: NormalizedAnnotation[],
  param: number,
): CleanupResult {
  return kind === "islands"
    ? removeIslands(anns, param)
    : removeOverlaps(anns, param);
}

/** Result of a cleanup pass over a set of annotations. */
export interface CleanupResult {
  /** Whole annotations to remove (deleted). */
  removedIds: string[];
  /** Annotations whose polygon rings were trimmed to a smaller set. */
  trimmed: { id: string; polygons: number[][] }[];
}

/** Shoelace area of one flat ring `[x1,y1,x2,y2,...]`, always positive. */
export function polygonArea(flat: number[]): number {
  let sum = 0;
  const n = flat.length;
  for (let i = 0; i + 1 < n; i += 2) {
    const x1 = flat[i];
    const y1 = flat[i + 1];
    const x2 = flat[(i + 2) % n];
    const y2 = flat[(i + 3) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Convert a flat ring `[x1,y1,...]` to a polygon-clipping Ring (`[x,y][]`). */
function flatToRing(flat: number[]): Ring {
  const ring: Ring = [];
  for (let i = 0; i + 1 < flat.length; i += 2)
    ring.push([flat[i], flat[i + 1]]);
  return ring;
}

/** Tight bbox of an annotation as `[x1, y1, x2, y2]`. */
export function bboxOf(
  ann: NormalizedAnnotation,
): [number, number, number, number] {
  if (ann.polygons.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of ann.polygons) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    return [minX, minY, maxX, maxY];
  }
  if (ann.bbox) {
    const [x, y, w, h] = ann.bbox;
    return [x, y, x + w, y + h];
  }
  return [0, 0, 0, 0];
}

/** A polygon-clipping MultiPolygon for an annotation: each ring is its own
 * (hole-less) polygon; a polygon-less annotation falls back to its bbox rect. */
function annToMultiPolygon(ann: NormalizedAnnotation): MultiPolygon {
  if (ann.polygons.length > 0) {
    return ann.polygons.map((flat) => [flatToRing(flat)]);
  }
  if (ann.bbox) {
    const [x, y, w, h] = ann.bbox;
    return [
      [
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
      ],
    ];
  }
  return [];
}

/** Net area of a polygon-clipping MultiPolygon (outer rings add, holes subtract). */
function multiPolygonArea(mp: MultiPolygon): number {
  let total = 0;
  for (const poly of mp) {
    for (const ring of poly) {
      let sum = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        sum += x1 * y2 - x2 * y1;
      }
      total += sum / 2;
    }
  }
  return Math.abs(total);
}

/** Total area of an annotation (Σ ring areas, or bbox `w*h` when polygon-less). */
export function annotationArea(ann: NormalizedAnnotation): number {
  if (ann.polygons.length > 0) {
    let sum = 0;
    for (const ring of ann.polygons) sum += polygonArea(ring);
    return sum;
  }
  if (ann.bbox) return ann.bbox[2] * ann.bbox[3];
  return 0;
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);
}

/** Exact intersection area between two annotations (0 on degenerate geometry). */
function intersectionArea(
  a: NormalizedAnnotation,
  b: NormalizedAnnotation,
): number {
  try {
    return multiPolygonArea(
      polygonClipping.intersection(annToMultiPolygon(a), annToMultiPolygon(b)),
    );
  } catch {
    return 0;
  }
}

/**
 * Drop polygon rings whose area is below `minArea`. Polygon-less annotations are
 * left untouched; an annotation whose rings are ALL below threshold is removed.
 */
export function removeIslands(
  anns: NormalizedAnnotation[],
  minArea: number,
): CleanupResult {
  const removedIds: string[] = [];
  const trimmed: { id: string; polygons: number[][] }[] = [];
  for (const ann of anns) {
    if (ann.polygons.length === 0) continue;
    const keep = ann.polygons.filter((r) => polygonArea(r) >= minArea);
    if (keep.length === ann.polygons.length) continue;
    if (keep.length === 0) removedIds.push(ann.id);
    else trimmed.push({ id: ann.id, polygons: keep });
  }
  return { removedIds, trimmed };
}

/**
 * Remove annotations mostly contained in a larger one. Greedy, area-descending:
 * a candidate is dropped when `intersection / area(candidate) >= threshold` for
 * an already-kept (larger-or-equal) survivor, so the bigger annotation wins.
 */
export function removeOverlaps(
  anns: NormalizedAnnotation[],
  threshold: number,
): CleanupResult {
  const items = anns
    .map((ann) => ({ ann, area: annotationArea(ann), bb: bboxOf(ann) }))
    .filter((x) => x.area > 0)
    .sort((a, b) => b.area - a.area);

  const survivors: typeof items = [];
  const removedIds: string[] = [];
  for (const cand of items) {
    let drop = false;
    for (const s of survivors) {
      if (!bboxesOverlap(cand.bb, s.bb)) continue;
      const inter = intersectionArea(cand.ann, s.ann);
      if (inter > 0 && inter / cand.area >= threshold) {
        drop = true;
        break;
      }
    }
    if (drop) removedIds.push(cand.ann.id);
    else survivors.push(cand);
  }
  return { removedIds, trimmed: [] };
}

/** Apply a CleanupResult to a list (for live preview). */
export function applyResult(
  anns: NormalizedAnnotation[],
  result: CleanupResult,
): NormalizedAnnotation[] {
  const removed = new Set(result.removedIds);
  const over = new Map(result.trimmed.map((t) => [t.id, t.polygons]));
  return anns
    .filter((a) => !removed.has(a.id))
    .map((a) => {
      const p = over.get(a.id);
      return p ? { ...a, polygons: p } : a;
    });
}
