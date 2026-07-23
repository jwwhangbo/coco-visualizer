import { promises as fs } from "node:fs";
import path from "node:path";
import { imageMime, resolveSafe } from "@/lib/paths";

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("path");
  if (!q) return new Response("Missing path", { status: 400 });
  try {
    const { abs, stat } = await resolveSafe(q);
    if (stat.isDirectory()) return new Response("Not a file", { status: 400 });

    // Validator from file mtime + size: lets the browser cache and repaint the
    // image across img remounts (tab switches) while still catching edits.
    // NOTE: `no-store` here caused remounted <img> elements to report complete
    // but paint blank in Chromium, so we cache with revalidation instead.
    const etag = `"${Math.round(stat.mtimeMs)}-${stat.size}"`;
    const headers = {
      "Content-Type": imageMime(path.extname(abs)),
      "Cache-Control": "no-cache",
      ETag: etag,
    };
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), { headers });
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}
