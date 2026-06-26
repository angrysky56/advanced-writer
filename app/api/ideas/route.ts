import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ENV } from "../../../src/config";

/**
 * Saved Brainstorm favorites. Persisted to <workspace>/_brainstorm/ideas.json.
 * The _brainstorm folder is underscore-prefixed so the workspace API never
 * surfaces it as a story.
 *
 *   GET                         -> { ideas: [...] }
 *   POST { action:"save", idea } -> add (deduped by logline)
 *   POST { action:"remove", id } -> remove by id
 */

function baseDir(): string {
  return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
}
function ideasFile(): string {
  return path.join(baseDir(), "_brainstorm", "ideas.json");
}

async function readIdeas(): Promise<any[]> {
  try {
    const raw = await fs.promises.readFile(ideasFile(), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIdeas(ideas: any[]): Promise<void> {
  await fs.promises.mkdir(path.dirname(ideasFile()), { recursive: true });
  await fs.promises.writeFile(
    ideasFile(),
    JSON.stringify(ideas, null, 2),
    "utf8",
  );
}

export async function GET() {
  return NextResponse.json({ ideas: await readIdeas() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action;
    let ideas = await readIdeas();

    if (action === "save") {
      const idea = body?.idea;
      if (!idea?.logline || typeof idea.logline !== "string") {
        return NextResponse.json(
          { error: "idea.logline required." },
          { status: 400 },
        );
      }
      const exists = ideas.some(
        (x) =>
          (x.logline || "").trim().toLowerCase() ===
          idea.logline.trim().toLowerCase(),
      );
      if (!exists) {
        ideas.unshift({
          id:
            idea.id ||
            `idea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          logline: idea.logline.trim(),
          genre: String(idea.genre || "").trim(),
          tone: String(idea.tone || "").trim(),
          hook: String(idea.hook || "").trim(),
          savedAt: new Date().toISOString(),
        });
        await writeIdeas(ideas);
      }
      return NextResponse.json({ ok: true, ideas });
    }

    if (action === "remove") {
      const id = body?.id;
      ideas = ideas.filter((x) => x.id !== id);
      await writeIdeas(ideas);
      return NextResponse.json({ ok: true, ideas });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
