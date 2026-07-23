import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { classify, resolveSafe } from "@/lib/paths";
import type { FsEntry, FsListing } from "@/lib/types";

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("path");
  try {
    const { abs, stat } = await resolveSafe(q);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const entries: FsEntry[] = [];
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue; // hide dotfiles
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        try {
          isDir = (await fs.stat(path.join(abs, d.name))).isDirectory();
        } catch {
          continue; // broken symlink
        }
      }
      entries.push({
        name: d.name,
        path: path.join(abs, d.name),
        type: classify(d.name, isDir),
      });
    }
    entries.sort((a, b) => {
      const ad = a.type === "dir" ? 0 : 1;
      const bd = b.type === "dir" ? 0 : 1;
      return ad - bd || a.name.localeCompare(b.name);
    });
    const parent = path.dirname(abs);
    const listing: FsListing = {
      path: abs,
      parent: parent === abs ? null : parent,
      entries,
    };
    return NextResponse.json(listing);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
