import { promises as fs } from "node:fs";
import path from "node:path";
import { stem } from "./stem";
import type {
  BBox,
  CocoCategory,
  LabelData,
  NormalizedAnnotation,
} from "./types";

/** Thrown when a file cannot be parsed as JSON — surfaced to the user's toast. */
export class InvalidJsonError extends Error {}

// Loose shapes for raw COCO input.
interface RawAnnotation {
  id?: number | string;
  image_id?: number | string;
  category_id?: number;
  bbox?: number[];
  polygon?: unknown;
  polygons?: unknown;
  segmentation?: unknown;
}
interface RawImage {
  id?: number | string;
  file_name?: string;
}
interface RawCoco {
  images?: RawImage[];
  annotations?: RawAnnotation[];
  categories?: { id: number; name?: string }[];
}

function toBBox(bbox: unknown): BBox | null {
  if (
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => typeof n === "number")
  ) {
    return [bbox[0], bbox[1], bbox[2], bbox[3]];
  }
  return null;
}

function toCoords(arr: unknown[]): number[] {
  return arr.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Normalize COCO polygon segmentation. Handles both the standard nested shape
 * `[[x1,y1,...], ...]` (a list of polygons) and the flat single-polygon shape
 * `[x1,y1,...]`, coercing numeric-string coords. RLE (an object) is skipped.
 */
function toPolygons(seg: unknown): number[][] {
  if (!Array.isArray(seg) || seg.length === 0) return [];
  // Nested: an array of polygons.
  if (Array.isArray(seg[0])) {
    const polygons: number[][] = [];
    for (const poly of seg) {
      if (!Array.isArray(poly)) continue;
      const coords = toCoords(poly);
      if (coords.length >= 6) polygons.push(coords);
    }
    return polygons;
  }
  // Flat: a single polygon [x1, y1, x2, y2, ...].
  const coords = toCoords(seg);
  return coords.length >= 6 ? [coords] : [];
}

function normalizeAnn(
  ann: RawAnnotation,
  catName: Map<number, string>,
  fallbackId: number,
): NormalizedAnnotation {
  const categoryId = typeof ann.category_id === "number" ? ann.category_id : -1;
  const rawId = String(ann.id ?? fallbackId);
  return {
    id: rawId,
    displayId: rawId,
    categoryId,
    categoryName: catName.get(categoryId) ?? String(categoryId),
    bbox: toBBox(ann.bbox),
    // Prefer an explicit `polygon`/`polygons` field; fall back to COCO `segmentation`.
    polygons: toPolygons(ann.polygon ?? ann.polygons ?? ann.segmentation),
  };
}

function categoriesFromRaw(raw: RawCoco["categories"]): CocoCategory[] {
  return (raw ?? []).map((c) => ({ id: c.id, name: c.name ?? String(c.id) }));
}

function parseFullCoco(coco: RawCoco): LabelData {
  const categories = categoriesFromRaw(coco.categories);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const idToStem = new Map<number | string, string>();
  for (const img of coco.images ?? []) {
    if (img.id !== undefined && img.file_name)
      idToStem.set(img.id, stem(img.file_name));
  }
  const annotationsByStem: Record<string, NormalizedAnnotation[]> = {};
  let counter = 0;
  for (const ann of coco.annotations ?? []) {
    const s =
      ann.image_id !== undefined ? idToStem.get(ann.image_id) : undefined;
    if (s === undefined) continue;
    let bucket = annotationsByStem[s];
    if (!bucket) {
      bucket = [];
      annotationsByStem[s] = bucket;
    }
    bucket.push(normalizeAnn(ann, catName, counter++));
  }
  return { categories, annotationsByStem };
}

function parsePerImage(json: unknown, sourceStem: string): LabelData {
  const obj = (json ?? {}) as {
    annotations?: RawAnnotation[];
    categories?: RawCoco["categories"];
  };
  const annsRaw: RawAnnotation[] = Array.isArray(json)
    ? (json as RawAnnotation[])
    : (obj.annotations ?? []);
  const categories = categoriesFromRaw(
    Array.isArray(json) ? [] : obj.categories,
  );
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const anns = annsRaw.map((a, i) => normalizeAnn(a, catName, i));
  // Infer any categories present on annotations but not declared.
  const declared = new Set(categories.map((c) => c.id));
  for (const a of anns) {
    if (!declared.has(a.categoryId)) {
      declared.add(a.categoryId);
      categories.push({ id: a.categoryId, name: a.categoryName });
    }
  }
  return { categories, annotationsByStem: { [sourceStem]: anns } };
}

function isFullCoco(json: unknown): json is RawCoco {
  return (
    !!json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    Array.isArray((json as RawCoco).images) &&
    Array.isArray((json as RawCoco).annotations)
  );
}

async function loadLabelFile(file: string): Promise<LabelData> {
  const raw = await fs.readFile(file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new InvalidJsonError(`${path.basename(file)} is not valid JSON`);
  }
  return isFullCoco(json)
    ? parseFullCoco(json)
    : parsePerImage(json, stem(file));
}

export function mergeLabelData(a: LabelData, b: LabelData): LabelData {
  const byId = new Map<number, CocoCategory>();
  for (const c of [...a.categories, ...b.categories])
    if (!byId.has(c.id)) byId.set(c.id, c);
  const annotationsByStem: Record<string, NormalizedAnnotation[]> = {
    ...a.annotationsByStem,
  };
  for (const [s, anns] of Object.entries(b.annotationsByStem)) {
    annotationsByStem[s] = [...(annotationsByStem[s] ?? []), ...anns];
  }
  return { categories: [...byId.values()], annotationsByStem };
}

/** Load labels from a single JSON file or every *.json in a directory. */
export async function loadLabels(abs: string): Promise<LabelData> {
  const st = await fs.stat(abs);
  if (!st.isDirectory()) return loadLabelFile(abs);
  const entries = await fs.readdir(abs);
  const jsons = entries.filter((e) => e.toLowerCase().endsWith(".json")).sort();
  let acc: LabelData = { categories: [], annotationsByStem: {} };
  for (const j of jsons)
    acc = mergeLabelData(acc, await loadLabelFile(path.join(abs, j)));
  return acc;
}

/** One annotation to remove, identified by its image stem + original COCO id. */
export interface Deletion {
  stem: string;
  annId: string;
}

/**
 * Remove annotations from the original COCO file(s) on disk, in place, matched
 * by `${stem}::${annId}`. We re-read and splice the original JSON so every
 * untouched field survives (RLE, area, iscrowd, image_id, info, …). Returns the
 * number of annotations actually removed.
 *
 * Note: annotations that lacked an `id` in the source got a synthetic
 * positional id during load, so they can't be matched here and are left intact.
 */
export async function applyDeletions(
  abs: string,
  deletions: Deletion[],
): Promise<number> {
  const keys = new Set(deletions.map((d) => `${d.stem}::${d.annId}`));
  const st = await fs.stat(abs);
  if (!st.isDirectory()) return deleteFromFile(abs, keys);
  const entries = await fs.readdir(abs);
  const jsons = entries.filter((e) => e.toLowerCase().endsWith(".json")).sort();
  let total = 0;
  for (const j of jsons) total += await deleteFromFile(path.join(abs, j), keys);
  return total;
}

async function deleteFromFile(
  file: string,
  keys: Set<string>,
): Promise<number> {
  const raw = await fs.readFile(file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return 0; // not JSON — leave it alone
  }

  let removed = 0;
  const keep = (key: string): boolean => {
    if (keys.has(key)) {
      removed++;
      return false;
    }
    return true;
  };

  if (isFullCoco(json)) {
    const idToStem = new Map<number | string, string>();
    for (const img of json.images ?? []) {
      if (img.id !== undefined && img.file_name)
        idToStem.set(img.id, stem(img.file_name));
    }
    const kept = (json.annotations ?? []).filter((ann) => {
      const s =
        ann.image_id !== undefined ? idToStem.get(ann.image_id) : undefined;
      if (s === undefined || ann.id === undefined) return true;
      return keep(`${s}::${String(ann.id)}`);
    });
    if (removed === 0) return 0;
    json.annotations = kept;
    await fs.writeFile(file, JSON.stringify(json, null, 2));
    return removed;
  }

  // Per-image: a bare annotations array or an object with `annotations`.
  const fileStem = stem(file);
  const filterAnns = (arr: RawAnnotation[]) =>
    arr.filter((ann) =>
      ann.id === undefined ? true : keep(`${fileStem}::${String(ann.id)}`),
    );

  if (Array.isArray(json)) {
    const kept = filterAnns(json as RawAnnotation[]);
    if (removed === 0) return 0;
    await fs.writeFile(file, JSON.stringify(kept, null, 2));
    return removed;
  }

  const obj = json as { annotations?: RawAnnotation[] };
  if (Array.isArray(obj.annotations)) {
    obj.annotations = filterAnns(obj.annotations);
    if (removed === 0) return 0;
    await fs.writeFile(file, JSON.stringify(obj, null, 2));
    return removed;
  }
  return 0;
}
