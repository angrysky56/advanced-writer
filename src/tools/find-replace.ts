import fs from "fs";
import path from "path";
import { workspaceExporter } from "../storage/workspace.js";

/**
 * Deterministic find & replace across workspace documents.
 *
 * This is the literal, predictable counterpart to the AI rewrite tools: it
 * changes exactly the text you ask it to and nothing else. Use it to rename a
 * character everywhere, fix a recurring typo, or swap a single word/line.
 *
 * Two phases, controlled by `apply`:
 *   - apply=false (default) → PREVIEW: report every match and what it would
 *     become, changing nothing on disk.
 *   - apply=true            → APPLY: make the edits, backing up each touched
 *     file to a timestamped .bak first (newest 10 kept).
 */

export type MatchMode = "literal" | "whole-word" | "regex";

/** Which kinds of document to search, mapped to their workspace subfolders. */
const KIND_DIRS: Record<string, string> = {
  scenes: "drafts",
  manuscript: "manuscript",
  characters: "characters",
  structure: "structure",
  reports: "storyscope-reports",
};

export interface FindReplaceOptions {
  find: string;
  replace: string;
  /** Restrict to a single story folder (its slug / id). Omit = all stories. */
  storyId?: string;
  /** Restrict to a single file (relative to workspace base). Overrides kinds. */
  relPath?: string;
  /** Which document kinds to search. Omit = all kinds. */
  kinds?: (keyof typeof KIND_DIRS)[];
  /** For versioned kinds (scenes/manuscript), restrict to one version e.g. "v1". */
  version?: string;
  mode?: MatchMode;
  caseSensitive?: boolean;
  /** Cap total replacements across all files (deterministic order). Omit = all. */
  limit?: number;
  /** false/undefined = preview only; true = write changes. */
  apply?: boolean;
}

export interface FileResult {
  path: string; // relative to workspace base
  matches: number;
  replacements: number;
  samples: { line: number; before: string; after: string }[];
  backup?: string | null;
}

export interface FindReplaceResult {
  applied: boolean;
  mode: MatchMode;
  find: string;
  replace: string;
  caseSensitive: boolean;
  totalMatches: number;
  totalReplacements: number;
  filesAffected: number;
  files: FileResult[];
  error?: string;
}

const MAX_BACKUPS = 10;
const MAX_SAMPLES = 6;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the search regex for a single match (no global flag). */
export function buildBase(opts: FindReplaceOptions): RegExp {
  const flags = opts.caseSensitive ? "" : "i";
  if (opts.mode === "regex") return new RegExp(opts.find, flags);
  if (opts.mode === "whole-word")
    return new RegExp(`\\b${escapeRegExp(opts.find)}\\b`, flags);
  return new RegExp(escapeRegExp(opts.find), flags);
}

/**
 * In literal / whole-word mode the replacement is taken verbatim, so any `$`
 * must be escaped from JS's replacement-pattern handling. In regex mode we
 * leave `$1` etc. intact so capture-group backreferences work.
 */
export function prepareReplacement(opts: FindReplaceOptions): string {
  if (opts.mode === "regex") return opts.replace;
  return opts.replace.replace(/\$/g, "$$$$");
}

async function pruneBackups(target: string): Promise<void> {
  try {
    const dir = path.dirname(target);
    const prefix = path.basename(target) + ".";
    const baks = (await fs.promises.readdir(dir))
      .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
      .sort();
    const excess = baks.length - MAX_BACKUPS;
    for (let i = 0; i < excess; i++) {
      await fs.promises.unlink(path.join(dir, baks[i])).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

async function backupFile(absPath: string): Promise<string | null> {
  if (!fs.existsSync(absPath)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bp = `${absPath}.${ts}.bak`;
  await fs.promises.copyFile(absPath, bp);
  await pruneBackups(absPath);
  return path.basename(bp);
}

/** Recursively collect .md files under dir (skipping .bak and hidden dirs). */
async function collectMd(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectMd(abs, base)));
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push(path.relative(base, abs));
    }
  }
  return out;
}

/** Decide whether a relative file path passes the kind/version/story filters. */
export function passesFilters(rel: string, opts: FindReplaceOptions): boolean {
  const parts = rel.split(path.sep);
  // parts[0] = story slug, parts[1] = kind folder, ...
  if (opts.storyId && parts[0] !== opts.storyId) return false;

  if (opts.kinds && opts.kinds.length > 0) {
    const allowedDirs = opts.kinds.map((k) => KIND_DIRS[k]).filter(Boolean);
    if (!allowedDirs.includes(parts[1])) return false;
  }

  if (opts.version && (parts[1] === "drafts" || parts[1] === "manuscript")) {
    // versioned layout: <story>/drafts/<version>/...  and  <story>/manuscript/<version>/...
    if (parts[2] !== opts.version) return false;
  }

  return true;
}

export async function runFindReplace(
  opts: FindReplaceOptions,
): Promise<FindReplaceResult> {
  const mode: MatchMode = opts.mode || "literal";
  const caseSensitive = !!opts.caseSensitive;
  const apply = opts.apply === true;
  const baseDir = path.resolve(workspaceExporter.baseDir);

  const result: FindReplaceResult = {
    applied: apply,
    mode,
    find: opts.find,
    replace: opts.replace,
    caseSensitive,
    totalMatches: 0,
    totalReplacements: 0,
    filesAffected: 0,
    files: [],
  };

  if (!opts.find) {
    result.error = "find is required.";
    return result;
  }

  // Validate a user-supplied regex up front so a bad pattern fails cleanly.
  let base: RegExp;
  try {
    base = buildBase({ ...opts, mode, caseSensitive });
  } catch (e: any) {
    result.error = `Invalid pattern: ${e?.message || e}`;
    return result;
  }
  const replacement = prepareReplacement({ ...opts, mode });

  // Resolve the file set.
  let relFiles: string[];
  if (opts.relPath) {
    const abs = path.resolve(baseDir, opts.relPath);
    if (abs !== baseDir && !abs.startsWith(baseDir + path.sep)) {
      result.error = "relPath escapes the workspace.";
      return result;
    }
    relFiles = [path.relative(baseDir, abs)];
  } else {
    relFiles = (await collectMd(baseDir, baseDir))
      .filter((r) => passesFilters(r, opts))
      .sort();
  }

  let remaining = typeof opts.limit === "number" ? opts.limit : Infinity;

  for (const rel of relFiles) {
    if (remaining <= 0 && apply) break;
    const abs = path.join(baseDir, rel);
    let content: string;
    try {
      content = await fs.promises.readFile(abs, "utf8");
    } catch {
      continue;
    }

    const gFlags = (caseSensitive ? "" : "i") + "g";
    const gRe = new RegExp(base.source, gFlags);
    const matches = content.match(gRe);
    const matchCount = matches ? matches.length : 0;
    if (matchCount === 0) continue;

    // How many we will actually replace in this file (respecting the cap).
    const toReplace = Math.min(matchCount, remaining);

    // Build samples (matched lines, with before/after) for the preview.
    const samples: FileResult["samples"] = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && samples.length < MAX_SAMPLES; i++) {
      const lineRe = new RegExp(base.source, gFlags);
      if (lineRe.test(lines[i])) {
        samples.push({
          line: i + 1,
          before: lines[i],
          after: lines[i].replace(new RegExp(base.source, gFlags), replacement),
        });
      }
    }

    // Perform the replacement (capped) on the full content.
    let newContent: string;
    if (toReplace >= matchCount) {
      newContent = content.replace(gRe, replacement);
    } else {
      let n = 0;
      newContent = content.replace(gRe, (m, ...rest) => {
        if (n >= toReplace) return m;
        n++;
        // Re-run the single-match regex to honor capture groups in regex mode.
        return m.replace(new RegExp(base.source, caseSensitive ? "" : "i"), replacement);
      });
    }

    const fileRes: FileResult = {
      path: rel,
      matches: matchCount,
      replacements: toReplace,
      samples,
    };

    if (apply && newContent !== content) {
      fileRes.backup = await backupFile(abs);
      await fs.promises.writeFile(abs, newContent, "utf8");
    }

    result.files.push(fileRes);
    result.totalMatches += matchCount;
    result.totalReplacements += toReplace;
    remaining -= toReplace;
  }

  result.filesAffected = result.files.length;
  return result;
}

/* --------------------------- MCP tool surface --------------------------- */

export const findReplaceDef = {
  name: "find_replace",
  description:
    "Deterministic find & replace across a story's documents — the literal counterpart to the AI rewrite tools. Renames a term everywhere, fixes a recurring typo, or changes a single word/line, touching ONLY the matched text. Defaults to a safe PREVIEW (apply=false) that reports every match without changing files; set apply=true to write the edits (each touched file is backed up first). Supports literal, whole-word, and regex matching.",
  inputSchema: {
    type: "object",
    properties: {
      find: { type: "string", description: "Text or regex to search for" },
      replace: { type: "string", description: "Replacement text" },
      story_id: {
        type: "string",
        description: "Restrict to one story (its folder slug). Omit = all stories.",
      },
      rel_path: {
        type: "string",
        description:
          "Restrict to a single file, relative to the workspace (e.g. 'my_story/drafts/v1/scene_1.md'). Overrides kinds.",
      },
      kinds: {
        type: "array",
        items: {
          type: "string",
          enum: ["scenes", "manuscript", "characters", "structure", "reports"],
        },
        description: "Which document kinds to search. Omit = all.",
      },
      version: {
        type: "string",
        description: "For scenes/manuscript, restrict to one draft version e.g. 'v1'.",
      },
      mode: {
        type: "string",
        enum: ["literal", "whole-word", "regex"],
        description:
          "literal = exact substring; whole-word = bounded by word edges (safe for names); regex = JS regex with $1 backrefs. Default literal.",
      },
      case_sensitive: { type: "boolean", description: "Default false." },
      limit: {
        type: "number",
        description: "Cap total replacements (e.g. 1 to change just the first). Omit = all.",
      },
      apply: {
        type: "boolean",
        description: "false (default) = preview only; true = write the changes.",
      },
    },
    required: ["find", "replace"],
  },
};

function summarize(r: FindReplaceResult): string {
  if (r.error) return `find_replace error: ${r.error}`;
  const head = r.applied
    ? `Applied ${r.totalReplacements} replacement(s) across ${r.filesAffected} file(s).`
    : `Preview: ${r.totalMatches} match(es) in ${r.filesAffected} file(s) (nothing changed yet — set apply=true to write).`;
  const lines = r.files.slice(0, 25).map((f) => {
    const sample = f.samples[0];
    const ex = sample ? `  e.g. L${sample.line}: "${sample.before.trim().slice(0, 80)}" → "${sample.after.trim().slice(0, 80)}"` : "";
    return `• ${f.path} — ${f.replacements}/${f.matches} replaced${f.backup ? ` (backup ${f.backup})` : ""}\n${ex}`;
  });
  return [head, ...lines].join("\n");
}

export async function executeFindReplace(args: any) {
  const opts: FindReplaceOptions = {
    find: args?.find,
    replace: args?.replace ?? "",
    storyId: args?.story_id,
    relPath: args?.rel_path,
    kinds: args?.kinds,
    version: args?.version,
    mode: args?.mode,
    caseSensitive: args?.case_sensitive,
    limit: args?.limit,
    apply: args?.apply,
  };
  const result = await runFindReplace(opts);
  return {
    content: [{ type: "text", text: summarize(result) }],
    isError: !!result.error,
    structuredContent: result,
  };
}
