import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  type ExportJobData,
  type ExportJobResult,
  getExportQueue,
} from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: Partial<ExportJobData>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const images = Array.isArray(body.images) ? body.images : [];
  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (images.length === 0)
    return NextResponse.json({ error: "No images selected" }, { status: 400 });
  if (images.some((i) => !i?.path || !i?.name || !i?.stem))
    return NextResponse.json(
      { error: "Invalid image selection" },
      { status: 400 },
    );
  try {
    const job = await getExportQueue().add("export", { images, sources });
    return NextResponse.json({ jobId: String(job.id) });
  } catch (err) {
    return NextResponse.json(
      { error: `Queue unavailable: ${(err as Error).message}` },
      { status: 503 },
    );
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId)
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  try {
    const job = await getExportQueue().getJob(jobId);
    if (!job)
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    const state = await job.getState();
    if (url.searchParams.get("download") === "1") {
      if (state !== "completed" || !job.returnvalue)
        return NextResponse.json(
          { error: "Export is not ready" },
          { status: 409 },
        );
      const result = job.returnvalue as ExportJobResult;
      const stream = Readable.toWeb(createReadStream(result.archivePath));
      return new Response(stream as ReadableStream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({
      job: {
        id: String(job.id),
        state,
        progress: job.progress,
        result: state === "completed" ? job.returnvalue : null,
        error: job.failedReason ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 503 },
    );
  }
}
