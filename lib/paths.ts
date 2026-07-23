import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type EntryType = "dir" | "image" | "json" | "other";

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".tif",
  ".tiff",
]);

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

export function homeDir(): string {
  return os.homedir();
}

export function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

export function imageMime(ext: string): string {
  return IMAGE_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export function classify(name: string, isDir: boolean): EntryType {
  if (isDir) return "dir";
  const ext = path.extname(name).toLowerCase();
  if (isImageExt(ext)) return "image";
  if (ext === ".json") return "json";
  return "other";
}

/**
 * Resolve a user-supplied absolute path and confirm it exists.
 * This is a local-only tool, so filesystem browsing is intentional; we only
 * guard against non-absolute / non-existent inputs.
 */
export async function resolveSafe(
  input: string | null,
): Promise<{ abs: string; stat: import("node:fs").Stats }> {
  const abs = input && input.length > 0 ? path.resolve(input) : homeDir();
  const stat = await fs.stat(abs);
  return { abs, stat };
}
