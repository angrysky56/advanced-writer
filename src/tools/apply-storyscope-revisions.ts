import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";

export const applyStoryscopeRevisionsDef = {
  name: "apply_storyscope_revisions",
  description:
    "Executes a massive Draft 2 background pass. Reads the StoryScope Executive Summary and systematically rewrites every single drafted scene to aggressively apply the structural To-Do list.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
    },
    required: ["story_id"],
  },
};

export async function executeApplyStoryscopeRevisions(args: any) {
  const { story_id } = args;

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

    // 2. List all drafts
    const draftFiles = await workspaceExporter.listDrafts(story_id);
    if (draftFiles.length === 0) {
      return {
        content: [
          { type: "text", text: `Error: No drafts found for ${story_id}.` },
        ],
        isError: true,
      };
    }

    const totalScenes = draftFiles.length;

    // 3. Rewrite Loop
    // We rewrite them sequentially to avoid rate limiting or overwhelming the LLM.
    for (let i = 0; i < totalScenes; i++) {
      const fileName = draftFiles[i];
      const sceneId = fileName.replace(".md", "");

      const sceneText = await workspaceExporter.readDraft(story_id, sceneId);
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
- DO NOT summarize. Output the fully rewritten scene prose.`;

      const rewrittenScene = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: systemPrompt,
        userMessage: `Here is the Draft 1 scene. Rewrite it completely for Draft 2.\n\n=== DRAFT 1 SCENE ===\n${sceneText}`,
      });

      // We overwrite the existing draft
      await workspaceExporter.saveDraft(story_id, sceneId, rewrittenScene);
    }

    // 4. Recompile the Manuscript programmatically to avoid LLM truncation
    const allDrafts = await workspaceExporter.readAllDrafts(story_id);

    // Save as final_manuscript_v2.md
    const storySlug = story_id.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dir = `${process.env.WORKSPACE_DIR || "./data/workspace"}/${storySlug}/manuscript`;
    const fs = await import("fs");
    const path = await import("path");
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      path.join(dir, "final_manuscript_v2.md"),
      allDrafts,
      "utf8",
    );

    return {
      content: [
        {
          type: "text",
          text: `Draft 2 Complete! Aggressively applied the Executive Summary to ${totalScenes} scenes. The new manuscript has been saved as final_manuscript_v2.md.`,
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
