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
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended — dispatches many lenses). Poll with check_job.",
        default: false,
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
        userMessage: `You are an expert editor reviewing a FINISHED manuscript. The Architecture Brief, World Bible, and Graph State below are EARLY PLANNING DRAFTS — reference material, NOT binding law. The manuscript is the living work and the AUTHOR'S INTENT IS PRIMARY. The plan serves the story, never the other way around.

Apply this aspect's framework to the manuscript and separate your findings into two clearly labelled categories:

1. CRAFT ISSUES — genuine problems INSIDE the manuscript: places where the story contradicts ITSELF, arcs that don't pay off, pacing or clarity failures, weak execution. These are real and should be fixed.

2. CANON DIVERGENCE — places where the manuscript departs from the planning documents. For EACH divergence, judge whether the manuscript's choice is as good or BETTER. If it is, do NOT call it an error — recommend UPDATING the planning document to match the manuscript. Only flag a divergence as a problem when it makes the STORY ITSELF worse or internally incoherent — never merely because it disagrees with the outline.

Do not penalize the manuscript for improving on its own plan. Be brutal about craft; be generous about intent.

=== ARCHITECTURE BRIEF (planning draft — not law) ===
${architecture}

=== WORLD BIBLE (planning draft — not law) ===
${worldBible}

=== NEO4J GRAPH STATE (CHARACTERS & ENTITIES) ===
${graphStateContext}

=== FINAL MANUSCRIPT (the living work — primary) ===
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

GUIDING PRINCIPLE: the manuscript is the living work and the AUTHOR'S INTENT IS PRIMARY. The Architecture Brief and World Bible are early planning drafts, not law. Divergence from the plan is NOT a failure — when the manuscript's choice is as good or better, the plan should be updated to match it, not the prose reverted.

Read all reports and synthesize them into a single, cohesive "Executive Summary" with these sections:
1. The manuscript's 3 greatest narrative strengths.
2. GENUINE CRAFT WEAKNESSES — only problems that make the STORY ITSELF worse: internal contradictions, unpaid-off arcs, pacing/clarity failures, weak execution. Do NOT list mere divergences from the planning documents here.
3. CANON RECONCILIATION — places where the manuscript has intentionally and effectively moved beyond the Architecture Brief / World Bible / Graph State, and those documents should be UPDATED to match the manuscript.
4. A prioritized To-Do List split into exactly two buckets:
   - (A) REVISE PROSE — craft fixes only (the genuine weaknesses from section 2).
   - (B) UPDATE CANON — reconcile the planning docs to the manuscript (from section 3).

Never recommend rewriting good prose merely to conform to an earlier outline. Format beautifully in Markdown.`;

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
