import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ENV } from "../../../src/config";

// Interface for parsed character
interface Character {
  name: string;
  archetype: string;
  description: string;
  summary: string;
  panksepp: Record<string, number>;
}

// Interface for parsed diagnostic
interface Diagnostic {
  sceneId: string;
  cortisol: number | null;
  oxytocin: number | null;
  dopamine: number | null;
  pathologies: string[];
}

// Interface for scene/draft
interface Draft {
  id: string;
  title: string;
  content: string;
}

// Interface for StoryScope aspect report
interface AspectReport {
  aspect: string;
  content: string;
}

// Helper to get active workspace directory
function getWorkspaceDir() {
  return process.env.WORKSPACE_DIR || ENV.WORKSPACE_DIR;
}

// Helpers for character parsing
function extractCharacterName(content: string, filename: string): string {
  const nameLabelMatch = content.match(
    /^(?:\*\*|)?Character Name(?:\*\*|)?\s*:\s*([^\n\r]+)/im,
  );
  if (nameLabelMatch) {
    const val = nameLabelMatch[1].replace(/[\*\_\[\]]/g, "").trim();
    if (val && !val.includes("[Full Name]")) return val;
  }

  const headerMatch = content.match(
    /^(?:###|##|#)\s*(?:Character Profile\s*:\s*)?([^\n\r]+)/im,
  );
  if (headerMatch) {
    const val = headerMatch[1].replace(/[\*\_\[\]]/g, "").trim();
    if (val && !val.toLowerCase().includes("[full name]")) return val;
  }

  return filename
    .replace(".md", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractArchetype(content: string): string {
  const archMatch = content.match(
    /^(?:\*\*|)?(?:Jungian\s+|Primary\s+)?Archetype(?:\*\*|)?\s*:\s*([^\n\r]+)/im,
  );
  if (archMatch) {
    return archMatch[1].replace(/[\*\_\[\]]/g, "").trim();
  }
  const lines = content.split("\n");
  const archLine = lines.find((l) => l.toLowerCase().includes("archetype"));
  if (archLine) {
    const cleanLine = archLine
      .replace(/#|-|archetype|:/gi, "")
      .replace(/[\*\_\[\]]/g, "")
      .trim();
    if (cleanLine) return cleanLine;
  }
  return "Archetype";
}

// All seven Panksepp primary-process systems. Reads real scores from the
// "Affect Profile" block written into each character profile; falls back to a
// name-hash only if a profile predates that block.
function extractPanksepp(
  content: string,
  hash: number,
): Record<string, number> {
  const fallback: Record<string, number> = {
    SEEKING: 5 + (hash % 5),
    FEAR: 2 + (hash % 8),
    RAGE: 1 + (hash % 6),
    LUST: 1 + (hash % 6),
    CARE: 3 + (hash % 7),
    PANIC_GRIEF: 2 + (hash % 7),
    PLAY: 4 + (hash % 6),
  };
  const patterns: Record<string, RegExp> = {
    SEEKING: /seek(?:ing)?\s*:\s*(\d+)/i,
    FEAR: /fear\s*:\s*(\d+)/i,
    RAGE: /rage\s*:\s*(\d+)/i,
    LUST: /lust\s*:\s*(\d+)/i,
    CARE: /care\s*:\s*(\d+)/i,
    PANIC_GRIEF: /panic(?:[_ ]?grief)?\s*:\s*(\d+)/i,
    PLAY: /play\s*:\s*(\d+)/i,
  };

  const result: Record<string, number> = {};
  for (const key of Object.keys(fallback)) {
    const m = content.match(patterns[key]);
    result[key] = m ? parseInt(m[1], 10) : fallback[key];
  }
  return result;
}

function getCleanSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("<!--") ||
      trimmed.startsWith("---")
    )
      continue;
    if (
      trimmed.startsWith("**Role:**") ||
      trimmed.startsWith("**Character Name:**") ||
      trimmed.startsWith("**Archetype:**") ||
      trimmed.startsWith("**Jungian Archetype:**")
    )
      continue;
    if (
      trimmed.startsWith("Role:") ||
      trimmed.startsWith("Character Name:") ||
      trimmed.startsWith("Archetype:") ||
      trimmed.startsWith("Jungian Archetype:")
    )
      continue;

    // Skip leaked LLM preamble so it never becomes the card summary.
    if (
      /^(excellent|certainly|sure|here(?:'s| is)\b|of course|absolutely|okay\b|ok\b|great[,!.]|based on the)/i.test(
        trimmed,
      )
    )
      continue;

    const clean = trimmed
      .replace(/[\*\_\[\]]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (clean.length > 10) {
      return clean.length > 120 ? clean.slice(0, 120) + "..." : clean;
    }
  }
  return "No summary description available.";
}

export async function GET(req?: Request) {
  try {
    const version = req
      ? new URL(req.url).searchParams.get("version") || "v1"
      : "v1";
    const baseDir = getWorkspaceDir();
    if (!fs.existsSync(baseDir)) {
      return NextResponse.json({
        workspaceDir: baseDir,
        stories: [],
      });
    }

    const dirs = await fs.promises.readdir(baseDir);
    dirs.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    const stories = [];

    for (const dirName of dirs) {
      const storyPath = path.join(baseDir, dirName);
      const stats = await fs.promises.stat(storyPath);
      if (!stats.isDirectory()) continue;

      const storyName = dirName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // 1. Read characters
      const characters: Character[] = [];
      const charDir = path.join(storyPath, "characters");
      if (fs.existsSync(charDir)) {
        const charFiles = await fs.promises.readdir(charDir);
        charFiles.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
        for (const file of charFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(
            path.join(charDir, file),
            "utf8",
          );
          const name = extractCharacterName(content, file);
          const archetype = extractArchetype(content);
          const hash = name
            .split("")
            .reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const panksepp = extractPanksepp(content, hash);
          const summary = getCleanSummary(content);

          characters.push({
            name,
            archetype,
            description: content,
            summary,
            panksepp,
          });
        }
      }

      // 2. Read diagnostics
      const diagnostics: Diagnostic[] = [];
      const diagDir = path.join(storyPath, "diagnostics");
      if (fs.existsSync(diagDir)) {
        const diagFiles = await fs.promises.readdir(diagDir);
        diagFiles.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
        for (const file of diagFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(
            path.join(diagDir, file),
            "utf8",
          );
          const sceneId = file
            .replace("neuro-critique-", "")
            .replace(".md", "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());

          // Parse REAL scores from the diagnostic's machine-readable block.
          // No hash fallback — an unscored report stays null (honestly "—" in
          // the UI) rather than fabricating numbers or pathologies.
          const num = (re: RegExp): number | null => {
            const m = content.match(re);
            return m ? parseInt(m[1], 10) : null;
          };
          const cortisol = num(/cortisol\s*[:=]\s*(\d+)/i);
          const oxytocin = num(/oxytocin\s*[:=]\s*(\d+)/i);
          const dopamine = num(/dopamine\s*[:=]\s*(\d+)/i);

          // Pathologies come ONLY from the model's explicit machine-block line
          // (anchored to line-start so we don't match an earlier prose
          // "**Pathologies:**" header, which is empty and zeroed the panel).
          let pathologies: string[] = [];
          const pathLine = content.match(/^\s*PATHOLOGIES\s*[:=]\s*(.+)$/im);
          if (pathLine) {
            pathologies = pathLine[1]
              .split(/[,;]/)
              .map((s) => s.replace(/[*_`]/g, "").trim())
              .filter((s) => s.length > 0 && !/^none$/i.test(s));
          }

          diagnostics.push({
            sceneId,
            cortisol,
            oxytocin,
            dopamine,
            pathologies,
          });
        }
      }

      // 3. Read architecture brief
      let architectureBrief = "No architecture brief generated yet.";
      const archPath = path.join(
        storyPath,
        "structure",
        "story-architecture-brief.md",
      );
      if (fs.existsSync(archPath)) {
        architectureBrief = await fs.promises.readFile(archPath, "utf8");
      }

      // 4. Read world bible
      let worldBible = "";
      const biblePath = path.join(storyPath, "structure", "world-bible.md");
      if (fs.existsSync(biblePath)) {
        worldBible = await fs.promises.readFile(biblePath, "utf8");
      }

      // 5. Read drafts for the requested version, and list available versions.
      let availableVersions: string[] = [];
      const draftsRoot = path.join(storyPath, "drafts");
      if (fs.existsSync(draftsRoot)) {
        availableVersions = (await fs.promises.readdir(draftsRoot))
          .filter((v) => /^v\d+$/i.test(v))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }
      if (availableVersions.length === 0) availableVersions = ["v1"];

      const drafts: Draft[] = [];
      const draftsDir = path.join(storyPath, "drafts", version);
      if (fs.existsSync(draftsDir)) {
        const draftFiles = await fs.promises.readdir(draftsDir);
        draftFiles.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
        for (const file of draftFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(
            path.join(draftsDir, file),
            "utf8",
          );
          const id = file.replace(".md", "");
          const title = id
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          drafts.push({ id, title, content });
        }
      }

      // 6. Read StoryScope reports
      const aspectReports: AspectReport[] = [];
      let executiveSummary = "";
      const reportsDir = path.join(storyPath, "storyscope-reports");
      if (fs.existsSync(reportsDir)) {
        const reportFiles = await fs.promises.readdir(reportsDir);
        reportFiles.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );
        for (const file of reportFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(
            path.join(reportsDir, file),
            "utf8",
          );
          if (file === "executive-summary.md") {
            executiveSummary = content;
          } else {
            const aspect = file
              .replace(".md", "")
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            aspectReports.push({ aspect, content });
          }
        }
      }

      // 7. Read compiled manuscript v1
      let manuscript = "";
      const manuscriptPath = path.join(
        storyPath,
        "manuscript",
        version,
        "final_manuscript.md",
      );
      if (fs.existsSync(manuscriptPath)) {
        manuscript = await fs.promises.readFile(manuscriptPath, "utf8");
      }

      stories.push({
        id: dirName,
        name: storyName,
        version,
        availableVersions,
        characters,
        diagnostics,
        architectureBrief,
        worldBible,
        drafts,
        aspectReports,
        executiveSummary,
        manuscript,
      });
    }

    return NextResponse.json({
      workspaceDir: baseDir,
      stories,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { path: newPath, action, projectName } = await req.json();

    if (action === "createProject") {
      if (!projectName) {
        return NextResponse.json({ error: "Project name is required." }, { status: 400 });
      }
      const baseDir = getWorkspaceDir();
      const folderName = projectName.trim().replace(/\s+/g, "_").toLowerCase();
      const newProjectPath = path.join(baseDir, folderName);
      if (!fs.existsSync(newProjectPath)) {
        await fs.promises.mkdir(newProjectPath, { recursive: true });
        await fs.promises.mkdir(path.join(newProjectPath, "characters"), { recursive: true });
        await fs.promises.mkdir(path.join(newProjectPath, "structure"), { recursive: true });
        await fs.promises.mkdir(path.join(newProjectPath, "drafts", "v1"), { recursive: true });
        await fs.promises.mkdir(path.join(newProjectPath, "diagnostics"), { recursive: true });
      }
      return GET();
    }

    if (!newPath) {
      return NextResponse.json(
        { error: "Path parameter is required." },
        { status: 400 },
      );
    }

    // Resolve absolute path
    const resolvedPath = path.resolve(newPath);

    // Try creating if it doesn't exist
    if (!fs.existsSync(resolvedPath)) {
      await fs.promises.mkdir(resolvedPath, { recursive: true });
    }

    process.env.WORKSPACE_DIR = resolvedPath;

    // Return the workspace state for the new path
    return GET();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
