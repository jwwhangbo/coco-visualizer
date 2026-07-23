import { NextResponse } from "next/server";
import { applyDeletions, type Deletion, loadLabels } from "@/lib/coco";
import { resolveSafe } from "@/lib/paths";

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("path");
  if (!q) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  try {
    const { abs } = await resolveSafe(q);
    const data = await loadLabels(abs);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}

interface DeletionRequest {
  sourcePath: string;
  stem: string;
  annId: string;
}

/**
 * Persist annotation deletions to disk, in place. Body:
 * `{ deletions: { sourcePath, stem, annId }[] }`. Deletions are grouped by
 * source path and applied to the original file(s), preserving other fields.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { deletions?: DeletionRequest[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const deletions = body?.deletions;
  if (!Array.isArray(deletions) || deletions.length === 0)
    return NextResponse.json(
      { error: "No deletions provided" },
      { status: 400 },
    );

  const bySource = new Map<string, Deletion[]>();
  for (const d of deletions) {
    if (!d?.sourcePath || !d?.stem || d?.annId === undefined) continue;
    const list = bySource.get(d.sourcePath) ?? [];
    list.push({ stem: d.stem, annId: String(d.annId) });
    bySource.set(d.sourcePath, list);
  }

  try {
    let removed = 0;
    for (const [sourcePath, list] of bySource) {
      const { abs } = await resolveSafe(sourcePath);
      removed += await applyDeletions(abs, list);
    }
    return NextResponse.json({ removed });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
