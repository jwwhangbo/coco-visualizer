import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { type Job, Worker } from "bullmq";
import { applyChanges, type Deletion, type Edit, loadLabels } from "./coco";
import { runCleanup } from "./geometry";
import { resolveSafe } from "./paths";
import {
  type CleanupJobData,
  type CleanupJobResult,
  EXPORT_QUEUE_NAME,
  type ExportJobData,
  type ExportJobResult,
  QUEUE_NAME,
} from "./queue";
import { getRedis } from "./redis";
import type { NormalizedAnnotation } from "./types";

/**
 * Run the cleanup across every requested source, scoped to the given image
 * stems, writing results to disk. Progress is reported as `{done, total}` where
 * the unit is one (source, stem) pair.
 */
async function processCleanup(
  job: Job<CleanupJobData, CleanupJobResult>,
): Promise<CleanupJobResult> {
  const { sources, stems, kind, param } = job.data;
  const stemSet = new Set(stems);

  // ---- load pass: read every source once, and figure out the total up front ----
  const loaded: {
    abs: string;
    byStem: Record<string, NormalizedAnnotation[]>;
    matched: string[];
  }[] = [];
  let total = 0;
  for (const src of sources) {
    const { abs } = await resolveSafe(src);
    const data = await loadLabels(abs);
    const matched = Object.keys(data.annotationsByStem).filter((s) =>
      stemSet.has(s),
    );
    total += matched.length;
    loaded.push({ abs, byStem: data.annotationsByStem, matched });
  }
  await job.updateProgress({ done: 0, total });

  // ---- process pass: compute per stem, then write once per source ----
  let removed = 0;
  let edited = 0;
  let done = 0;
  const step = Math.max(1, Math.floor(total / 100)); // cap progress updates at ~100
  for (const { abs, byStem, matched } of loaded) {
    const deletions: Deletion[] = [];
    const edits: Edit[] = [];
    for (const stem of matched) {
      const anns = byStem[stem] ?? [];
      const result = runCleanup(kind, anns, param);
      const byId = new Map(anns.map((a) => [a.id, a]));
      for (const id of result.removedIds) {
        const a = byId.get(id);
        if (a) deletions.push({ stem, annId: a.displayId });
      }
      for (const t of result.trimmed) {
        const a = byId.get(t.id);
        if (a) edits.push({ stem, annId: a.displayId, polygons: t.polygons });
      }
      done++;
      if (done % step === 0) await job.updateProgress({ done, total });
    }
    const r = await applyChanges(abs, deletions, edits);
    removed += r.removed;
    edited += r.edited;
  }

  await job.updateProgress({ done: total, total });
  return { removed, edited, total };
}

declare global {
  // eslint-disable-next-line no-var
  var __cocoCleanupWorker: Worker<CleanupJobData, CleanupJobResult> | undefined;
}

/**
 * Start the in-process BullMQ worker. Guarded on `globalThis` so Next dev HMR
 * (and any repeat `register()`) doesn't spawn duplicates.
 */
export function startCleanupWorker(): Worker<CleanupJobData, CleanupJobResult> {
  if (globalThis.__cocoCleanupWorker) return globalThis.__cocoCleanupWorker;
  const worker = new Worker<CleanupJobData, CleanupJobResult>(
    QUEUE_NAME,
    processCleanup,
    { connection: getRedis(), concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[cleanup] job ${job?.id} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error("[cleanup] worker error:", err.message);
  });
  globalThis.__cocoCleanupWorker = worker;
  return worker;
}

function uniqueArchiveNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let candidate = name;
    let n = 2;
    while (used.has(candidate.toLowerCase()))
      candidate = `${base}-${n++}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

async function processExport(
  job: Job<ExportJobData, ExportJobResult>,
): Promise<ExportJobResult> {
  const { images, sources } = job.data;
  const loaded = await Promise.all(
    sources.map(async (source) => {
      const { abs } = await resolveSafe(source);
      return { source, data: await loadLabels(abs) };
    }),
  );
  const archivePath = path.join(os.tmpdir(), `coco-export-${randomUUID()}.zip`);
  const output = createWriteStream(archivePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);

  const archiveNames = uniqueArchiveNames(images.map((image) => image.name));
  let annotationCount = 0;
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const archiveName = archiveNames[i];
    const { abs, stat } = await resolveSafe(image.path);
    if (stat.isDirectory()) throw new Error(`${image.path} is not a file`);
    archive.file(abs, { name: `images/${archiveName}` });

    const categories = new Map<number, { id: number; name: string }>();
    const annotations: Record<string, unknown>[] = [];
    for (const { source, data } of loaded) {
      for (const category of data.categories)
        categories.set(category.id, category);
      for (const ann of data.annotationsByStem[image.stem] ?? []) {
        annotations.push({
          id: annotations.length + 1,
          source,
          source_annotation_id: ann.displayId,
          category_id: ann.categoryId,
          bbox: ann.bbox,
          segmentation: ann.polygons,
        });
      }
    }
    annotationCount += annotations.length;
    archive.append(
      JSON.stringify(
        {
          image: { file_name: archiveName },
          categories: [...categories.values()],
          annotations,
        },
        null,
        2,
      ),
      {
        name: `annot/${path.basename(archiveName, path.extname(archiveName))}.json`,
      },
    );
    await job.updateProgress({ done: i + 1, total: images.length });
  }
  await archive.finalize();
  await completed;
  return {
    archivePath,
    filename: `coco-export-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`,
    imageCount: images.length,
    annotationCount,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __cocoExportWorker: Worker<ExportJobData, ExportJobResult> | undefined;
}

export function startExportWorker(): Worker<ExportJobData, ExportJobResult> {
  if (globalThis.__cocoExportWorker) return globalThis.__cocoExportWorker;
  const worker = new Worker<ExportJobData, ExportJobResult>(
    EXPORT_QUEUE_NAME,
    processExport,
    { connection: getRedis(), concurrency: 1 },
  );
  worker.on("failed", (job, err) =>
    console.error(`[export] job ${job?.id} failed:`, err.message),
  );
  worker.on("error", (err) =>
    console.error("[export] worker error:", err.message),
  );
  globalThis.__cocoExportWorker = worker;
  return worker;
}
