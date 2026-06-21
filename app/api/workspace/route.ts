import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ENV } from "../../../src/config";

// Interface for parsed character
interface Character {
  name: string;
  archetype: string;
  description: string;
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
        for (const file of charFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(
            path.join(charDir, file),
            "utf8",
          );
          const name = file
            .replace(".md", "")
            .replace(/\b\w/g, (c) => c.toUpperCase());

          let archetype = "Archetype";
          if (content.toLowerCase().includes("archetype")) {
            const lines = content.split("\n");
            const archLine = lines.find((l) =>
              l.toLowerCase().includes("archetype"),
            );
            if (archLine)
              archetype = archLine.replace(/#|-|archetype|:/gi, "").trim();
          }

          const hash = name
            .split("")
            .reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const panksepp = {
            SEEKING: 5 + (hash % 5),
            FEAR: 2 + (hash % 8),
            RAGE: 1 + (hash % 6),
            PANIC: 2 + (hash % 7),
            PLAY: 4 + (hash % 6),
            CARE: 3 + (hash % 7),
          };

          characters.push({ name, archetype, description: content, panksepp });
        }
      }

      // 2. Read diagnostics
      const diagnostics: Diagnostic[] = [];
      const diagDir = path.join(storyPath, "diagnostics");
      if (fs.existsSync(diagDir)) {
        const diagFiles = await fs.promises.readdir(diagDir);
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
