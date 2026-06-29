/**
 * Auto-start the local Chroma server — no Python, no manual steps.
 *
 * The TypeScript `chromadb` package is a CLIENT; it needs a Chroma SERVER to
 * talk to. The npm package ships that server as a bundled native binary
 * (`node_modules/chromadb/dist/cli.mjs run`), so we can start it ourselves from
 * Node with zero extra tooling. This module makes that happen automatically:
 * any process that touches the vector store (the MCP server or the Next app)
 * calls `ensureChromaServer()`, which is a no-op if the server is already up and
 * otherwise spawns it (detached) and waits for its heartbeat.
 */
import { spawn } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { ENV } from "../config.js";

let starting: Promise<boolean> | null = null;

function baseUrl(): string {
  const host = ENV.CHROMA_HOST || "localhost";
  const port = ENV.CHROMA_PORT || 8001;
  return `http://${host}:${port}`;
}

/** True if a Chroma server answers its heartbeat at the configured host/port. */
async function isUp(timeoutMs = 1500): Promise<boolean> {
  for (const v of ["v2", "v1"]) {
    try {
      const res = await fetch(`${baseUrl()}/api/${v}/heartbeat`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** Resolve the bundled chromadb server CLI shipped inside node_modules. */
function resolveCliPath(): string | null {
  const candidates: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    const main = require.resolve("chromadb"); // .../chromadb/dist/cjs/chromadb.cjs
    let dir = path.dirname(main);
    // Walk up to the package root (the dir that holds package.json).
    while (dir !== path.dirname(dir)) {
      if (
        fs.existsSync(path.join(dir, "package.json")) &&
        path.basename(dir) === "chromadb"
      ) {
        candidates.push(path.join(dir, "dist", "cli.mjs"));
        break;
      }
      dir = path.dirname(dir);
    }
  } catch {
    /* fall through to cwd guess */
  }
  candidates.push(path.join(process.cwd(), "node_modules/chromadb/dist/cli.mjs"));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Ensure a Chroma server is running. Idempotent and fail-open: if it can't be
 * started (e.g. missing binary), it logs and returns false so the caller can
 * degrade gracefully rather than crash the drafting pipeline.
 */
export async function ensureChromaServer(): Promise<boolean> {
  if (await isUp()) return true;
  if (starting) return starting;

  starting = (async () => {
    const cli = resolveCliPath();
    if (!cli) {
      console.error(
        "[chroma] bundled server CLI not found in node_modules/chromadb — vector store will be unavailable.",
      );
      return false;
    }

    const persist = path.resolve(
      process.cwd(),
      ENV.CHROMA_PERSIST_DIR || "./data/chroma",
    );
    const host = ENV.CHROMA_HOST || "localhost";
    const port = String(ENV.CHROMA_PORT || 8001);

    try {
      await fs.promises.mkdir(persist, { recursive: true });
      const child = spawn(
        process.execPath,
        [cli, "run", "--path", persist, "--host", host, "--port", port],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
      console.error(
        `[chroma] starting bundled server on ${host}:${port} (persist: ${persist})`,
      );
    } catch (e) {
      console.error("[chroma] failed to spawn bundled server:", e);
      return false;
    }

    // Wait for it to accept connections (cold start of the Rust binary).
    for (let i = 0; i < 30; i++) {
      if (await isUp()) {
        console.error("[chroma] server is up.");
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.error("[chroma] server did not become ready within ~15s.");
    return false;
  })();

  const ok = await starting;
  starting = null; // allow a future retry if it failed
  return ok;
}
