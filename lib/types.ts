// Shared types — no Node imports, safe to import from client components.

export type EntryType = "dir" | "image" | "json" | "other";

/** Which annotation geometry to draw on the overlay. */
export type GeometryMode = "bbox" | "seg" | "both";

export type ViewMode = "single" | "grid";

/** A file or folder that labels were loaded from. */
export interface LabelSource {
  path: string;
  name: string;
  kind: "file" | "folder";
}

export interface FsEntry {
  name: string;
  path: string;
  type: EntryType;
}

export interface FsListing {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export type BBox = [number, number, number, number];

export interface NormalizedAnnotation {
  /** Globally unique id within the loaded dataset (used as React key / hidden-map key). */
  id: string;
  /** Original COCO annotation id, for display. */
  displayId: string;
  categoryId: number;
  categoryName: string;
  /** COCO bbox [x, y, w, h] in image pixels, or null. */
  bbox: BBox | null;
  /** Each polygon is a flat list of image-pixel coords [x1, y1, x2, y2, ...]. */
  polygons: number[][];
}

export interface CocoCategory {
  id: number;
  name: string;
}

/** Result of parsing one or more label sources. */
export interface LabelData {
  categories: CocoCategory[];
  /** Keyed by image basename-without-extension. */
  annotationsByStem: Record<string, NormalizedAnnotation[]>;
}

// ---- Client-side dataset model ----

export interface DatasetImage {
  name: string;
  path: string;
  stem: string;
}

/**
 * An opened image data source, shown as a tab. Only the shared identity + image
 * list live here; per-tab view state (selected image, view mode, page, …) is
 * owned locally by each tab's <SourceScreen>.
 */
export interface ImageSource {
  /** Folder path or single-image path — unique per tab. */
  id: string;
  name: string;
  kind: "image" | "folder";
  images: DatasetImage[];
}
