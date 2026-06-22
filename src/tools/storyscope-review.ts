import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const storyscopeFinalReviewDef = {
  name: "storyscope_final_review",
  description:
    "Runs the ultimate multi-agent StoryScope review on a finished manuscript. Dispatches 7 parallel analytical lenses (Plot, Agents, Style, etc.) and synthesizes them into an Executive Summary.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: {
        type: "string",
        description:
          "The story to review. Must have a compiled final_manuscript.md.",
      },
    },
    required: ["story_id"],
  },
};

export async function executeStoryscopeFinalReview(args: any) {
  const { story_id } = args;

  try {
    const manuscript = await workspaceExporter.readManuscript(story_id);
    if (!manuscript) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No compiled manuscript found for story: ${story_id}. Please expand to novel or fast-auto complete first.`,
          },
        ],
        isError: true,
      };
    }

    const architecture =
      (await workspaceExporter.readArchitectureBrief(story_id)) ||
      "Architecture not found.";

    // We need a readWorldBible method, if it doesn't exist we can just read the file directly
    let worldBible = "";
    try {
      const storySlug = story_id.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      worldBible = await fs.promises.readFile(
        path.join(
          process.env.WORKSPACE_DIR || "./data/workspace",
          storySlug,
          "structure",
          "world-bible.md",
        ),
        "utf8",
      );
    } catch {
      worldBible = "World bible not found.";
    }

    const storyState = await neo4jStorage.getStoryState(story_id);
    const graphStateContext = JSON.stringify(storyState, null, 2);

    const promptsDir = path.join(__dirname, "../references/storyscope-prompts");
    const promptFiles = await fs.promises.readdir(promptsDir);
    const aspectFiles = promptFiles.filter(
      (f) => f.startsWith("aspect_") && f.endsWith(".md"),
    );

    if (aspectFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope prompt templates found.`,
          },
        ],
        isError: true,
      };
    }

    const reports: { aspect: string; report: string }[] = [];

    // Run parallel evaluations
    const promises = aspectFiles.map(async (file) => {
      const aspectName = file.replace("aspect_", "").replace(".md", "");
      const rawPrompt = await fs.promises.readFile(
        path.join(promptsDir, file),
        "utf8",
      );

      // Override the JSON extraction instructions
      const modifiedPrompt = `${rawPrompt}\n\n=== OVERRIDE INSTRUCTIONS ===\nIGNORE ANY INSTRUCTIONS ABOVE ASKING FOR JSON OUTPUT OR DATASET EXTRACTION. Your task is to act as an expert Editor applying the conceptual frameworks detailed above to the provided manuscript. Write a deep, comprehensive markdown prose report analyzing the manuscript's execution of this specific aspect. Be brutal but constructive.`;

      const report = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: modifiedPrompt,
        userMessage: `You are evaluating a manuscript against its foundational "Canon" documents.
Identify any discrepancies, character arc failures, or continuity errors based on the World Bible and Graph State.

=== ARCHITECTURE BRIEF ===
${architecture}

=== WORLD BIBLE ===
${worldBible}

=== NEO4J GRAPH STATE (CHARACTERS & ENTITIES) ===
${graphStateContext}

=== FINAL MANUSCRIPT ===
${manuscript}`,
      });

      await workspaceExporter.saveStoryscopeReport(
        story_id,
        aspectName,
        report,
      );
      reports.push({ aspect: aspectName, report });
      return report;
    });

    // Tolerate partial failures: a single lens erroring (e.g. one provider
    // hiccup, or the manuscript exceeding a model's context window) should not
    // discard the lenses that succeeded.
    const settled = await Promise.allSettled(promises);
    const failedCount = settled.filter((s) => s.status === "rejected").length;

    if (reports.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: all ${aspectFiles.length} StoryScope lenses failed. The manuscript may exceed the diagnostic model's context window, or the provider returned errors. No reports were generated.`,
          },
        ],
        isError: true,
      };
    }

    // Synthesize Executive Summary
    const synthesisPrompt = `You are the Executive Editor-in-Chief. Your team of specialist dramaturgs and structuralists have provided deep-dive reports on the manuscript from multiple distinct analytical lenses (Plot, Agents, Perspective, etc.).

Read all of their reports and synthesize them into a single, cohesive "Executive Summary."
Your summary must:
1. Identify the manuscript's 3 greatest narrative strengths.
2. Identify the manuscript's 3 most glaring structural or stylistic weaknesses.
3. Provide a prioritized, actionable "To-Do List" for Draft 2.

Format your output beautifully in Markdown.`;

    const allReportsContext = reports
      .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.report}`)
      .join("\n\n");

    const executiveSummary = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: synthesisPrompt,
      userMessage: `Synthesize the following reports:\n\n${allReportsContext}`,
    });

    await workspaceExporter.saveStoryscopeExecutiveSummary(
      story_id,
      executiveSummary,
    );

    return {
      content: [
        {
          type: "text",
          text: `StoryScope Final Review Complete! Generated ${reports.length} of ${aspectFiles.length} aspect reports${failedCount > 0 ? ` (${failedCount} lens(es) failed and were skipped)` : ""} and 1 Executive Summary. Saved to workspace under ${story_id}/storyscope-reports.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running storyscope review: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
