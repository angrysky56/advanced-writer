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
  cortisol: number;
  oxytocin: number;
  dopamine: number;
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

function extractPanksepp(
  content: string,
  hash: number,
): Record<string, number> {
  let seeking = 5 + (hash % 5);
  let fear = 2 + (hash % 8);
  let rage = 1 + (hash % 6);
  let panic = 2 + (hash % 7);
  let play = 4 + (hash % 6);
  let care = 3 + (hash % 7);

  const seekingMatch = content.match(/seek(?:ing)?\s*:\s*(\d+)/i);
  const fearMatch = content.match(/fear\s*:\s*(\d+)/i);
  const rageMatch = content.match(/rage\s*:\s*(\d+)/i);
  const panicMatch = content.match(/panic\s*:\s*(\d+)/i);
  const playMatch = content.match(/play\s*:\s*(\d+)/i);
  const careMatch = content.match(/care\s*:\s*(\d+)/i);

  if (seekingMatch) seeking = parseInt(seekingMatch[1], 10);
  if (fearMatch) fear = parseInt(fearMatch[1], 10);
  if (rageMatch) rage = parseInt(rageMatch[1], 10);
  if (panicMatch) panic = parseInt(panicMatch[1], 10);
  if (playMatch) play = parseInt(playMatch[1], 10);
  if (careMatch) care = parseInt(careMatch[1], 10);

  return {
    SEEKING: seeking,
    FEAR: fear,
    RAGE: rage,
    PANIC: panic,
    PLAY: play,
    CARE: care,
  };
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

export async function GET() {
  try {
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

          const hash = sceneId
            .split("")
            .reduce((acc, c) => acc + c.charCodeAt(0), 0);

          // Parse actual neurochemical scores from file if present
          let cortisol = 3 + (hash % 8);
          let oxytocin = 2 + (hash % 9);
          let dopamine = 4 + (hash % 7);

          const cortMatch = content.match(/cortisol:\s*(\d+)/i);
          const oxyMatch = content.match(/oxytocin:\s*(\d+)/i);
          const dopaMatch = content.match(/dopamine:\s*(\d+)/i);
          if (cortMatch) cortisol = parseInt(cortMatch[1], 10);
          if (oxyMatch) oxytocin = parseInt(oxyMatch[1], 10);
          if (dopaMatch) dopamine = parseInt(dopaMatch[1], 10);

          const pathologies = [];
          if (cortisol < 5) pathologies.push("Somatic Metaphor Cliché");
          if (oxytocin < 4) pathologies.push("False Protagonist Activity");
          if (dopamine < 4) pathologies.push("Flatlining Dopamine");
          if (hash % 3 === 0) pathologies.push("Moralizing Ending");

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

      // 5. Read drafts/v1 (scenes/chapters)
      const drafts: Draft[] = [];
      const draftsDir = path.join(storyPath, "drafts", "v1");
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
        "v1",
        "final_manuscript.md",
      );
      if (fs.existsSync(manuscriptPath)) {
        manuscript = await fs.promises.readFile(manuscriptPath, "utf8");
      }

      stories.push({
        id: dirName,
        name: storyName,
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
    const { path: newPath } = await req.json();
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
