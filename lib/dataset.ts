import { stem } from "./stem";
import type {
  CocoCategory,
  DatasetImage,
  FsEntry,
  LabelData,
  LabelSource,
  NormalizedAnnotation,
} from "./types";

/** A parsed label payload together with the file/folder it came from. */
export interface LabelSet {
  source: LabelSource;
  data: LabelData;
}

/** Merged labels keyed for lookup by image stem, independent of which images are open. */
export interface MergedLabels {
  categories: Record<number, CocoCategory>;
  annotationsByStem: Record<string, NormalizedAnnotation[]>;
}

export function imagesFromEntries(entries: FsEntry[]): DatasetImage[] {
  return entries
    .filter((e) => e.type === "image")
    .map((e) => ({ name: e.name, path: e.path, stem: stem(e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Merge all loaded label sources into a stem-keyed lookup. Annotation ids are
 * namespaced by source path + image stem so they stay globally unique (used as
 * React keys and visibility-map keys); this also lets a single source be removed
 * cleanly by rebuilding from what remains.
 */
export function buildLabels(sets: LabelSet[]): MergedLabels {
  const categories: Record<number, CocoCategory> = {};
  const annotationsByStem: Record<string, NormalizedAnnotation[]> = {};
  for (const { source, data } of sets) {
    for (const c of data.categories) categories[c.id] = c;
    for (const [s, anns] of Object.entries(data.annotationsByStem)) {
      let bucket = annotationsByStem[s];
      if (!bucket) {
        bucket = [];
        annotationsByStem[s] = bucket;
      }
      for (const a of anns) {
        bucket.push({ ...a, id: `${source.path}::${s}::${a.id}` });
      }
    }
  }
  return { categories, annotationsByStem };
}
