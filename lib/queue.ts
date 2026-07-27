import { Queue } from "bullmq";
import type { CleanupKind } from "./geometry";
import { getRedis } from "./redis";

export const QUEUE_NAME = "cleanup";
export const EXPORT_QUEUE_NAME = "export";

/** Payload for a bulk "apply cleanup to every image in the source" job. */
export interface CleanupJobData {
  /** Label source paths (file or folder) to rewrite. */
  sources: string[];
  /** Image stems to scope the work to. */
  stems: string[];
  kind: CleanupKind;
  param: number;
}

export interface CleanupJobResult {
  removed: number;
  edited: number;
  total: number;
}

export interface ExportImage {
  name: string;
  path: string;
  stem: string;
}

/** Server-side archive request. Sources are all currently loaded annotation
 * sources; the worker merges the entries concerning each selected image. */
export interface ExportJobData {
  images: ExportImage[];
  sources: string[];
}

export interface ExportJobResult {
  archivePath: string;
  filename: string;
  imageCount: number;
  annotationCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __cocoCleanupQueue: Queue<CleanupJobData, CleanupJobResult> | undefined;
  // eslint-disable-next-line no-var
  var __cocoExportQueue: Queue<ExportJobData, ExportJobResult> | undefined;
}

export function getExportQueue(): Queue<ExportJobData, ExportJobResult> {
  if (!globalThis.__cocoExportQueue) {
    globalThis.__cocoExportQueue = new Queue<ExportJobData, ExportJobResult>(
      EXPORT_QUEUE_NAME,
      {
        connection: getRedis(),
        defaultJobOptions: {
          removeOnComplete: { age: 3600, count: 50 },
          removeOnFail: { age: 3600 },
        },
      },
    );
  }
  return globalThis.__cocoExportQueue;
}

/** Lazy singleton producer-side queue. Only call this at request time — the
 * constructor is cheap but we never want it running during the build. */
export function getCleanupQueue(): Queue<CleanupJobData, CleanupJobResult> {
  if (!globalThis.__cocoCleanupQueue) {
    globalThis.__cocoCleanupQueue = new Queue<CleanupJobData, CleanupJobResult>(
      QUEUE_NAME,
      {
        connection: getRedis(),
        defaultJobOptions: {
          // Keep finished jobs around briefly so the Jobs dropdown can show them.
          removeOnComplete: { age: 3600, count: 50 },
          removeOnFail: { age: 3600 },
        },
      },
    );
  }
  return globalThis.__cocoCleanupQueue;
}
