import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ENV } from "../../../src/config";

/**
 * Per-story copilot chat history. Conversations are stored as JSON so they
 * reload faithfully (including tool-call parts).
 *
 * Layout:
 *   <workspace>/<storyId>/chats/<chatId>.json           — active
 *   <workspace>/<storyId>/chats/archived/<chatId>.json  — archived
 *
 *   GET  ?storyId=&id=            -> full conversation
 *   GET  ?storyId=&archived=1     -> metadata list (active, or archived)
 *   PUT  {storyId,id?,title?,messages} -> upsert (creates id if absent)
 *   POST {action,storyId,id}      -> archive | unarchive | delete
 */

function getWorkspaceDir(): string {
  return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
}

/** Allow only a safe single path segment (no separators, no traversal). */
function safeSeg(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const v = s.trim();
  if (!v || v.length > 200) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return v;
}

function chatsDir(storyId: string): string {
  return path.join(getWorkspaceDir(), storyId, "chats");
}
function archivedDir(storyId: string): string {
  return path.join(chatsDir(storyId), "archived");
}

/** Pull a readable title from the first user message (minus the project tag). */
function deriveTitle(messages: any[]): string {
  const firstUser = (messages || []).find((m) => m?.role === "user");
  const textPart = firstUser?.parts?.find((p: any) => p?.type === "text");
  let text: string = textPart?.text || "";
  text = text.replace(/^\(Active project:[^)]*\)\s*/i, "").trim();
  if (!text) return "Untitled conversation";
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}

async function readMeta(file: string) {
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    const data = JSON.parse(raw);
    return {
      id: data.id ?? path.basename(file, ".json"),
      title: data.title || deriveTitle(data.messages || []),
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null,
      messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
    };
  } catch {
    return null;
  }
}

async function listMeta(dir: string) {
  let files: string[];
  try {
    files = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const metas = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const meta = await readMeta(path.join(dir, f));
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
  );
  return metas;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const storyId = safeSeg(url.searchParams.get("storyId"));
    if (!storyId) {
      return NextResponse.json({ error: "Valid storyId required." }, { status: 400 });
    }
    const id = url.searchParams.get("id");
    const archived = url.searchParams.get("archived") === "1";

    if (id) {
      const safeId = safeSeg(id);
      if (!safeId) {
        return NextResponse.json({ error: "Invalid id." }, { status: 400 });
      }
      // Look in active first, then archived.
      for (const dir of [chatsDir(storyId), archivedDir(storyId)]) {
        const file = path.join(dir, `${safeId}.json`);
        if (fs.existsSync(file)) {
          const data = JSON.parse(await fs.promises.readFile(file, "utf8"));
          return NextResponse.json(data);
        }
      }
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const list = await listMeta(archived ? archivedDir(storyId) : chatsDir(storyId));
    return NextResponse.json({ storyId, archived, conversations: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const storyId = safeSeg(body?.storyId);
    if (!storyId) {
      return NextResponse.json({ error: "Valid storyId required." }, { status: 400 });
    }
    if (!Array.isArray(body?.messages)) {
      return NextResponse.json({ error: "messages array required." }, { status: 400 });
    }

    let id = safeSeg(body?.id) || null;
    const now = new Date().toISOString();
    const dir = chatsDir(storyId);
    await fs.promises.mkdir(dir, { recursive: true });

    let createdAt = now;
    if (id) {
      // Preserve original createdAt on update if the file already exists.
      const existing = path.join(dir, `${id}.json`);
      if (fs.existsSync(existing)) {
        try {
          const prev = JSON.parse(await fs.promises.readFile(existing, "utf8"));
          if (prev?.createdAt) createdAt = prev.createdAt;
        } catch {
          /* ignore corrupt prior file */
        }
      }
    } else {
      id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const record = {
      id,
      storyId,
      title: body.title || deriveTitle(body.messages),
      createdAt,
      updatedAt: now,
      messages: body.messages,
    };
    await fs.promises.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify(record, null, 2),
      "utf8",
    );
    return NextResponse.json({
      id,
      title: record.title,
      updatedAt: now,
      createdAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action;
    const storyId = safeSeg(body?.storyId);
    const id = safeSeg(body?.id);
    if (!storyId || !id) {
      return NextResponse.json(
        { error: "Valid storyId and id required." },
        { status: 400 },
      );
    }

    const activeFile = path.join(chatsDir(storyId), `${id}.json`);
    const archFile = path.join(archivedDir(storyId), `${id}.json`);

    if (action === "archive") {
      if (!fs.existsSync(activeFile)) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
      await fs.promises.mkdir(archivedDir(storyId), { recursive: true });
      await fs.promises.rename(activeFile, archFile);
      return NextResponse.json({ ok: true, action });
    }

    if (action === "unarchive") {
      if (!fs.existsSync(archFile)) {
        return NextResponse.json({ error: "Archived conversation not found." }, { status: 404 });
      }
      await fs.promises.mkdir(chatsDir(storyId), { recursive: true });
      await fs.promises.rename(archFile, activeFile);
      return NextResponse.json({ ok: true, action });
    }

    if (action === "delete") {
      let removed = false;
      for (const f of [activeFile, archFile]) {
        if (fs.existsSync(f)) {
          await fs.promises.unlink(f);
          removed = true;
        }
      }
      return NextResponse.json({ ok: removed, action });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
