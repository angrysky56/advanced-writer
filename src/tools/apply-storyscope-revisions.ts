import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";

export const applyStoryscopeRevisionsDef = {
  name: "apply_storyscope_revisions",
  description:
    "Executes a massive Draft 2 background pass. Reads the StoryScope Executive Summary and systematically rewrites every drafted scene to aggressively apply the structural To-Do list. Non-destructive: writes to a new draft version.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      source_version: {
        type: "string",
        description: "Draft version to read from (default 'v1')",
        default: "v1",
      },
      target_version: {
        type: "string",
        description: "Draft version to write the rewrites to (default 'v2')",
        default: "v2",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended — rewrites every scene). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id"],
  },
};

export async function executeApplyStoryscopeRevisions(args: any) {
  const {
    story_id,
    source_version = "v1",
    target_version = "v2",
  } = args;

  try {
    // 1. Read Executive Summary
    const executiveSummary =
      await workspaceExporter.readStoryscopeExecutiveSummary(story_id);
    if (!executiveSummary) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope Executive Summary found for ${story_id}. Run storyscope_final_review first.`,
          },
        ],
        isError: true,
      };
    }

    // 2. List all source drafts
    const draftFiles = await workspaceExporter.listDrafts(
      story_id,
      source_version,
    );
    if (draftFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No drafts found for ${story_id} (version ${source_version}).`,
          },
        ],
        isError: true,
      };
    }

    const totalScenes = draftFiles.length;

    // 3. Rewrite loop — sequential, reading from source_version and writing the
    // rewritten scene to target_version so Draft 1 is never overwritten.
    for (let i = 0; i < totalScenes; i++) {
      const fileName = draftFiles[i];
      const sceneId = fileName.replace(".md", "");

      const sceneText = await workspaceExporter.readDraft(
        story_id,
        sceneId,
        source_version,
      );
      if (!sceneText) continue;

      const systemPrompt = `You are a ruthless, brilliant MFA-level Editor executing "Draft 2".
You have been given a massive structural Executive Summary for the entire novel.
Your task is to rewrite the provided scene to aggressively apply the To-Do list instructions.

=== EXECUTIVE SUMMARY (DRAFT 2 TO-DO LIST) ===
${executiveSummary}

=== INSTRUCTIONS ===
- Read the scene below.
- Look at the Executive Summary. If it says "Cut every third 'as if'", do it. If it says "Deepen the social world", add a secondary character reaction if appropriate.
- You must rewrite the entire scene from start to finish.
- DO NOT summarize. Output the fully rewritten scene prose.
- CRITICAL CONTINUITY RULE: Do NOT "correct" intentional stylistic misspellings, character voice quirks, or code snippets. Treat technical terms and stylistic choices as canon.`;

      const rewrittenScene = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: systemPrompt,
        userMessage: `Here is the Draft 1 scene. Rewrite it completely for Draft 2.\n\n=== DRAFT 1 SCENE ===\n${sceneText}`,
      });

      await workspaceExporter.saveDraft(
        story_id,
        sceneId,
        rewrittenScene,
        target_version,
      );
    }

    // 4. Compile the new version's manuscript programmatically (no truncation).
    const allDrafts = await workspaceExporter.readAllDrafts(
      story_id,
      target_version,
    );
    await workspaceExporter.saveManuscript(story_id, allDrafts, target_version);

    return {
      content: [
        {
          type: "text",
          text: `Draft 2 complete! Applied the Executive Summary to ${totalScenes} scenes. Originals (${source_version}) are untouched; the new draft and manuscript were saved under version ${target_version}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running apply_storyscope_revisions: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
