import { NextResponse } from "next/server";
import { applyChanges, type Deletion, type Edit, loadLabels } from "@/lib/coco";
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
interface EditRequest extends DeletionRequest {
  polygons: number[][];
}

/**
 * Persist annotation deletions and geometry edits to disk, in place. Body:
 * `{ deletions: { sourcePath, stem, annId }[], edits: { …, polygons }[] }`.
 * Both are grouped by source path and applied to the original file(s),
 * preserving all other fields.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { deletions?: DeletionRequest[]; edits?: EditRequest[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const deletions = Array.isArray(body?.deletions) ? body.deletions : [];
  const edits = Array.isArray(body?.edits) ? body.edits : [];
  if (deletions.length === 0 && edits.length === 0)
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });

  const delBySource = new Map<string, Deletion[]>();
  for (const d of deletions) {
    if (!d?.sourcePath || !d?.stem || d?.annId === undefined) continue;
    const list = delBySource.get(d.sourcePath) ?? [];
    list.push({ stem: d.stem, annId: String(d.annId) });
    delBySource.set(d.sourcePath, list);
  }
  const editBySource = new Map<string, Edit[]>();
  for (const e of edits) {
    if (!e?.sourcePath || !e?.stem || e?.annId === undefined) continue;
    if (!Array.isArray(e.polygons)) continue;
    const list = editBySource.get(e.sourcePath) ?? [];
    list.push({ stem: e.stem, annId: String(e.annId), polygons: e.polygons });
    editBySource.set(e.sourcePath, list);
  }

  try {
    let removed = 0;
    let edited = 0;
    const sources = new Set([...delBySource.keys(), ...editBySource.keys()]);
    for (const sourcePath of sources) {
      const { abs } = await resolveSafe(sourcePath);
      const r = await applyChanges(
        abs,
        delBySource.get(sourcePath) ?? [],
        editBySource.get(sourcePath) ?? [],
      );
      removed += r.removed;
      edited += r.edited;
    }
    return NextResponse.json({ removed, edited });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
