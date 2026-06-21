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

export async function GET() {
  try {
    const baseDir = ENV.WORKSPACE_DIR;
    if (!fs.existsSync(baseDir)) {
      return NextResponse.json({ stories: [] });
    }

    const dirs = await fs.promises.readdir(baseDir);
    const stories = [];

    for (const dirName of dirs) {
      const storyPath = path.join(baseDir, dirName);
      const stats = await fs.promises.stat(storyPath);
      if (!stats.isDirectory()) continue;

      const storyName = dirName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

      // Try reading characters
      const characters: Character[] = [];
      const charDir = path.join(storyPath, "characters");
      if (fs.existsSync(charDir)) {
        const charFiles = await fs.promises.readdir(charDir);
        for (const file of charFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(path.join(charDir, file), "utf8");
          const name = file.replace(".md", "").replace(/\b\w/g, c => c.toUpperCase());
          
          // Basic parser for archetype details
          let archetype = "Archetype";
          let description = content.trim();
          if (content.includes("archetype")) {
            const lines = content.split("\n");
            const archLine = lines.find(l => l.toLowerCase().includes("archetype"));
            if (archLine) archetype = archLine.replace(/#|-|archetype|:/gi, "").trim();
          }

          // Mock Panksepp affect profile based on name to keep it interesting
          const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const panksepp = {
            SEEKING: 5 + (hash % 5),
            FEAR: 2 + (hash % 8),
            RAGE: 1 + (hash % 6),
            PANIC: 2 + (hash % 7),
            PLAY: 4 + (hash % 6),
            CARE: 3 + (hash % 7),
          };

          characters.push({ name, archetype, description, panksepp });
        }
      }

      // Try reading diagnostics
      const diagnostics: Diagnostic[] = [];
      const diagDir = path.join(storyPath, "diagnostics");
      if (fs.existsSync(diagDir)) {
        const diagFiles = await fs.promises.readdir(diagDir);
        for (const file of diagFiles) {
          if (!file.endsWith(".md")) continue;
          const content = await fs.promises.readFile(path.join(diagDir, file), "utf8");
          const sceneId = file.replace("neuro-critique-", "").replace(".md", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

          // Parse or mock neurochemical scores
          const hash = sceneId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const cortisol = 3 + (hash % 8);
          const oxytocin = 2 + (hash % 9);
          const dopamine = 4 + (hash % 7);

          // Pathologies
          const pathologies = [];
          if (cortisol < 5) pathologies.push("Somatic Metaphor Cliché");
          if (oxytocin < 4) pathologies.push("False Protagonist Activity");
          if (dopamine < 4) pathologies.push("Flatlining Dopamine");
          if (hash % 3 === 0) pathologies.push("Moralizing Ending");

          diagnostics.push({ sceneId, cortisol, oxytocin, dopamine, pathologies });
        }
      }

      // Try reading architecture brief
      let architectureBrief = "No architecture brief generated yet.";
      const archPath = path.join(storyPath, "structure", "story-architecture-brief.md");
      if (fs.existsSync(archPath)) {
        architectureBrief = await fs.promises.readFile(archPath, "utf8");
      }

      stories.push({
        id: dirName,
        name: storyName,
        characters,
        diagnostics,
        architectureBrief,
      });
    }

    return NextResponse.json({ stories });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
