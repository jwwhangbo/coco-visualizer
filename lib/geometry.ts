// Client-safe geometry helpers for the cleanup tools (island / overlap removal).
// No node imports — safe to use from client components.

import type { MultiPolygon, Ring } from "polygon-clipping";
import polygonClipping from "polygon-clipping";
import type { NormalizedAnnotation } from "./types";

/** Which cleanup tool an action came from. */
export type CleanupKind = "islands" | "overlaps" | "merge";

/** Run the cleanup of `kind` with its scalar parameter. */
export function runCleanup(
  kind: CleanupKind,
  anns: NormalizedAnnotation[],
  param: number,
): CleanupResult {
  if (kind === "islands") return removeIslands(anns, param);
  if (kind === "merge") return mergeAnnotations(anns, param);
  return removeOverlaps(anns, param);
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

/** Convert a polygon-clipping Ring (`[x,y][]`) back to a flat `[x1,y1,...]`. */
function ringToFlat(ring: Ring): number[] {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return flat;
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

/**
 * Merge intersecting **same-class** segmentation annotations into one. Two
 * annotations join when `intersection / area(smaller) >= threshold` (containment,
 * same metric as the overlap remover); merging is transitive within a class
 * (union-find), so A–B and B–C collapse into one group even if A and C don't
 * touch. Each group keeps its **largest-area** member as the survivor, whose
 * geometry becomes the union of the group (outer rings only — inner/hole rings
 * are dropped, matching the flat, hole-less polygon model); the rest are removed.
 * Polygon-less (bbox-only) annotations are ignored.
 */
export function mergeAnnotations(
  anns: NormalizedAnnotation[],
  threshold: number,
): CleanupResult {
  const removedIds: string[] = [];
  const trimmed: { id: string; polygons: number[][] }[] = [];

  // Group segmentation annotations by class.
  const byClass = new Map<number, NormalizedAnnotation[]>();
  for (const ann of anns) {
    if (ann.polygons.length === 0) continue;
    const bucket = byClass.get(ann.categoryId);
    if (bucket) bucket.push(ann);
    else byClass.set(ann.categoryId, [ann]);
  }

  for (const group of byClass.values()) {
    if (group.length < 2) continue;
    const items = group.map((ann) => ({
      ann,
      area: annotationArea(ann),
      bb: bboxOf(ann),
    }));

    // Union-find over the class: link pairs whose containment meets threshold.
    const parent = items.map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while (parent[r] !== r) r = parent[r];
      while (parent[i] !== r) {
        const next = parent[i];
        parent[i] = r;
        i = next;
      }
      return r;
    };
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.area <= 0 || b.area <= 0) continue;
        if (!bboxesOverlap(a.bb, b.bb)) continue;
        const inter = intersectionArea(a.ann, b.ann);
        if (inter > 0 && inter / Math.min(a.area, b.area) >= threshold) {
          parent[find(i)] = find(j);
        }
      }
    }

    // Collect components, then union each multi-member component.
    const components = new Map<number, number[]>();
    for (let i = 0; i < items.length; i++) {
      const root = find(i);
      const list = components.get(root);
      if (list) list.push(i);
      else components.set(root, [i]);
    }

    for (const idxs of components.values()) {
      if (idxs.length < 2) continue;
      let survivor = idxs[0];
      for (const i of idxs) if (items[i].area > items[survivor].area) survivor = i;

      let union: MultiPolygon = [];
      for (const i of idxs) {
        const mp = annToMultiPolygon(items[i].ann);
        union = union.length === 0 ? mp : polygonClipping.union(union, mp);
      }
      // Outer ring (index 0) of each resulting polygon; drop holes.
      const polygons = union
        .map((poly) => (poly.length > 0 ? ringToFlat(poly[0]) : []))
        .filter((flat) => flat.length >= 6);
      if (polygons.length === 0) continue;

      trimmed.push({ id: items[survivor].ann.id, polygons });
      for (const i of idxs)
        if (i !== survivor) removedIds.push(items[i].ann.id);
    }
  }

  return { removedIds, trimmed };
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
