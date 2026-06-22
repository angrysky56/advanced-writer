import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ENV } from "./config.js";

/**
 * Tiny fire-and-forget job runner for long-running tools.
 *
 * The MCP server is a long-lived process, so a tool can start work in the
 * background, return a job id immediately (avoiding any client request
 * timeout), and let the work continue. Progress/results are written to
 * `<WORKSPACE_DIR>/_jobs/<id>.json` and polled via the `check_job` tool.
 *
 * Caveat: jobs live in-process. If the MCP server (i.e. the desktop app that
 * launched it) shuts down, an in-flight job stops. For an hour-long novel run,
 * keep the app open — same as any local background task.
 */

export interface JobRecord {
  id: string;
  tool: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  result?: string;
  error?: string;
  args?: any;
}

function jobsDir(): string {
  const base = process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
  const dir = path.join(base, "_jobs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jobPath(id: string): string {
  return path.join(jobsDir(), `${id}.json`);
}

function write(rec: JobRecord): void {
  try {
    fs.writeFileSync(jobPath(rec.id), JSON.stringify(rec, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write job record", rec.id, e);
  }
}

/**
 * Start a background job. Returns immediately with a `running` record; the
 * provided async function runs detached and updates the record on completion.
 */
export function startJob(
  tool: string,
  args: any,
  run: () => Promise<any>,
): JobRecord {
  const rec: JobRecord = {
    id: randomUUID().slice(0, 8),
    tool,
    status: "running",
    startedAt: new Date().toISOString(),
    args,
  };
  write(rec);

  // Detached on purpose — do NOT await. Errors are captured into the record so
  // an unhandled rejection can never take down the server process.
  void (async () => {
    try {
      const out = await run();
      const text =
        out?.content?.[0]?.text ??
        (typeof out === "string" ? out : "Completed.");
      write({
        ...rec,
        status: out?.isError ? "failed" : "completed",
        finishedAt: new Date().toISOString(),
        result: text,
        ...(out?.isError ? { error: text } : {}),
      });
    } catch (e: any) {
      write({
        ...rec,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: e?.message || String(e),
      });
    }
  })();

  return rec;
}

export function getJob(id: string): JobRecord | null {
  try {
    return JSON.parse(fs.readFileSync(jobPath(id), "utf8")) as JobRecord;
  } catch {
    return null;
  }
}

export function listJobs(): JobRecord[] {
  try {
    return fs.readdirSync(jobsDir())
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) =>
          JSON.parse(
            fs.readFileSync(path.join(jobsDir(), f), "utf8"),
          ) as JobRecord,
      )
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  } catch {
    return [];
  }
}
