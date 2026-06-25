import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ENV } from "../../../src/config";

/**
 * Hand-editing endpoint. Writes a markdown document back to the workspace,
 * keeping a timestamped backup of whatever was there before so an edit can
 * never silently destroy prior text.
 *
 * Body: { relPath: string; content: string }
 *   - relPath is relative to the active workspace base dir (the same paths the
 *     /api/workspace GET now returns on each editable item).
 */

const MAX_BACKUPS = 10;

function getWorkspaceDir(): string {
  return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
}

/** Keep only the newest MAX_BACKUPS sibling .bak files for a given target. */
async function pruneBackups(target: string): Promise<void> {
  try {
    const dir = path.dirname(target);
    const prefix = path.basename(target) + ".";
    const baks = (await fs.promises.readdir(dir))
      .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
      .sort(); // ISO timestamps sort oldest -> newest
    const excess = baks.length - MAX_BACKUPS;
    for (let i = 0; i < excess; i++) {
      await fs.promises.unlink(path.join(dir, baks[i])).catch(() => {});
    }
  } catch {
    /* best-effort; never block a save on backup housekeeping */
  }
}

export async function PUT(req: Request) {
  try {
    const { relPath, content } = await req.json();

    if (typeof relPath !== "string" || !relPath.trim()) {
      return NextResponse.json(
        { error: "relPath is required." },
        { status: 400 },
      );
    }
    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "content must be a string." },
        { status: 400 },
      );
    }

    const baseDir = path.resolve(getWorkspaceDir());
    const target = path.resolve(baseDir, relPath);

    // Containment guard — refuse anything that resolves outside the workspace.
    if (target !== baseDir && !target.startsWith(baseDir + path.sep)) {
      return NextResponse.json(
        { error: "Path escapes the workspace." },
        { status: 400 },
      );
    }
    // Only markdown documents are hand-editable.
    if (!target.endsWith(".md")) {
      return NextResponse.json(
        { error: "Only .md files are editable." },
        { status: 400 },
      );
    }

    await fs.promises.mkdir(path.dirname(target), { recursive: true });

    // Back up the existing file before overwriting it.
    let backup: string | null = null;
    if (fs.existsSync(target)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${target}.${ts}.bak`;
      await fs.promises.copyFile(target, backupPath);
      backup = path.basename(backupPath);
      await pruneBackups(target);
    }

    await fs.promises.writeFile(target, content, "utf8");

    return NextResponse.json({
      ok: true,
      relPath,
      bytes: Buffer.byteLength(content, "utf8"),
      backup,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
