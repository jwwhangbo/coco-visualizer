import { Queue } from "bullmq";
import type { CleanupKind } from "./geometry";
import { getRedis } from "./redis";

export const QUEUE_NAME = "cleanup";

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

declare global {
  // eslint-disable-next-line no-var
  var __cocoCleanupQueue: Queue<CleanupJobData, CleanupJobResult> | undefined;
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
