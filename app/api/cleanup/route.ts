import type { Job } from "bullmq";
import { NextResponse } from "next/server";
import type { CleanupKind } from "@/lib/geometry";
import {
  type CleanupJobData,
  type CleanupJobResult,
  getCleanupQueue,
} from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "unknown";

interface JobView {
  id: string;
  kind: CleanupKind;
  param: number;
  state: JobState;
  progress: { done: number; total: number } | null;
  result: CleanupJobResult | null;
  error: string | null;
  timestamp: number;
  finishedOn: number | null;
  sourceCount: number;
  stemCount: number;
}

function toView(
  job: Job<CleanupJobData, CleanupJobResult>,
  state: JobState,
): JobView {
  const p = job.progress;
  return {
    id: String(job.id),
    kind: job.data?.kind ?? "islands",
    param: job.data?.param ?? 0,
    state,
    progress:
      p && typeof p === "object" && "total" in p
        ? (p as { done: number; total: number })
        : null,
    result: (job.returnvalue as CleanupJobResult) ?? null,
    error: job.failedReason ?? null,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn ?? null,
    sourceCount: job.data?.sources?.length ?? 0,
    stemCount: job.data?.stems?.length ?? 0,
  };
}

/**
 * Enqueue a bulk cleanup job. Body:
 * `{ sources: string[], stems: string[], kind, param }`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Partial<CleanupJobData>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sources = Array.isArray(body?.sources) ? body.sources : [];
  const stems = Array.isArray(body?.stems) ? body.stems : [];
  const kind = body?.kind;
  const param = body?.param;
  if (sources.length === 0 || stems.length === 0)
    return NextResponse.json(
      { error: "No sources or stems provided" },
      { status: 400 },
    );
  if (kind !== "islands" && kind !== "overlaps")
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (typeof param !== "number" || !Number.isFinite(param))
    return NextResponse.json({ error: "Invalid param" }, { status: 400 });

  try {
    const job = await getCleanupQueue().add("cleanup", {
      sources,
      stems,
      kind,
      param,
    });
    return NextResponse.json({ jobId: String(job.id) });
  } catch (err) {
    return NextResponse.json(
      { error: `Queue unavailable: ${(err as Error).message}` },
      { status: 503 },
    );
  }
}

/** List recent jobs (or one by `?jobId=`) for the Jobs dropdown. */
export async function GET(req: Request): Promise<Response> {
  const jobId = new URL(req.url).searchParams.get("jobId");
  try {
    const queue = getCleanupQueue();

    if (jobId) {
      const job = await queue.getJob(jobId);
      if (!job) return NextResponse.json({ job: null });
      const state = (await job.getState()) as JobState;
      return NextResponse.json({ job: toView(job, state) });
    }

    // Fetch per state so we can tag without an extra round trip per job.
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(0, 20),
      queue.getActive(0, 20),
      queue.getCompleted(0, 20),
      queue.getFailed(0, 20),
      queue.getDelayed(0, 20),
    ]);
    const jobs: JobView[] = [
      ...active.map((j) => toView(j, "active")),
      ...waiting.map((j) => toView(j, "waiting")),
      ...delayed.map((j) => toView(j, "delayed")),
      ...failed.map((j) => toView(j, "failed")),
      ...completed.map((j) => toView(j, "completed")),
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json(
      { error: `Queue unavailable: ${(err as Error).message}` },
      { status: 503 },
    );
  }
}
