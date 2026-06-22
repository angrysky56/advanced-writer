import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { executeContinueNarrative } from "./continue-narrative.js";
import { generateAndSeedCast } from "./_cast.js";

export const expandToNovelDef = {
  name: "expand_to_novel",
  description:
    "Expands a brief synopsis into a structured Beat Sheet, and optionally automatically drafts the entire manuscript scene by scene.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      synopsis: {
        type: "string",
        description: "A 1-3 page summary of the story",
      },
      target_length: {
        type: "string",
        enum: ["novella", "novel", "screenplay"],
        description: "The intended length and format.",
      },
      auto_draft: {
        type: "boolean",
        description:
          "If true, it will loop through the generated beat sheet and draft EVERY scene consecutively. WARNING: Can take an hour+ for a novel.",
        default: false,
      },
      version: {
        type: "string",
        description: "The version tag for the draft (e.g., 'v2')",
        default: "v1",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (strongly recommended when auto_draft=true). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id", "synopsis", "target_length"],
  },
};

export async function executeExpandToNovel(args: any) {
  const {
    story_id,
    synopsis,
    target_length,
    auto_draft = false,
    version = "v1",
  } = args;

  try {
    // 1. Explode Synopsis into Beat Sheet
    const beatSheetPrompt = `You are a master structural editor. Explode the following synopsis into a highly detailed Scene-by-Scene Beat Sheet for a ${target_length}.

=== SYNOPSIS ===
${synopsis}

Your output MUST be a numbered list of scenes. Each scene must have a brief description of what happens, the emotional shift, and the characters involved. Do not write the scenes themselves, only the outline.
Example:
1. Scene 1: [Description]
2. Scene 2: [Description]
`;

    const beatSheetContent = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt: beatSheetPrompt,
      userMessage: "Generate the full Beat Sheet.",
    });

    await workspaceExporter.saveBeatSheet(story_id, beatSheetContent);

    if (!auto_draft) {
      return {
        content: [
          {
            type: "text",
            text: `Beat Sheet generated and saved to workspace for ${story_id}. You can review it before drafting.`,
          },
        ],
      };
    }

    // 2. Ensure the story has memory to draw on BEFORE drafting.
    // Without a seeded cast + architecture brief, continue_narrative draws on
    // an empty graph state and drifts. Seed them if they don't already exist.
    const existingArch =
      await workspaceExporter.readArchitectureBrief(story_id);
    if (!existingArch) {
      const archPrompt = `You are an expert story architect. Build a concise story architecture brief for a ${target_length} based on this synopsis.\n\nSynopsis: ${synopsis}`;
      const arch = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: archPrompt,
        userMessage: "Generate the Architecture Brief.",
      });
      await workspaceExporter.saveArchitectureBrief(story_id, arch);
    }

    const existingCast = await neo4jStorage.getCharactersForStory(story_id);
    if (!existingCast || existingCast.length === 0) {
      await generateAndSeedCast(story_id, synopsis);
    }

    // 3. Auto-Draft the entire Beat Sheet.
    // Parse the numbered list to figure out how many scenes to generate.
    const beatLines = beatSheetContent
      .split("\n")
      .filter((line) => /^\d+\./.test(line.trim()));
    const totalScenes = beatLines.length > 0 ? beatLines.length : 10; // fallback if parse fails

    let drafted = 0;
    for (let i = 1; i <= totalScenes; i++) {
      const beatDescription = beatLines[i - 1] || `Write scene ${i}`;

      const res: any = await executeContinueNarrative({
        story_id: story_id,
        previous_scene_id: i === 1 ? "none" : `scene_${i - 1}`,
        next_scene_id: `scene_${i}`,
        user_direction: `Follow this beat perfectly: ${beatDescription}`,
        version: version,
      });

      // Stop on failure instead of silently dropping scenes and breaking the
      // previous-scene chain for everything that follows.
      if (res?.isError) {
        // Still compile what we have so the partial work isn't lost.
        const partial = await workspaceExporter.readAllDrafts(
          story_id,
          version,
        );
        await workspaceExporter.saveManuscript(story_id, partial, version);
        return {
          content: [
            {
              type: "text",
              text: `Expansion stopped at scene_${i}: ${res.content?.[0]?.text || "scene generation failed"}. Drafted ${drafted} scene(s) for ${story_id} and compiled a partial manuscript. Rerun continue_narrative from scene_${drafted} to resume.`,
            },
          ],
          isError: true,
        };
      }
      drafted++;
    }

    // 4. Compile the Manuscript programmatically (no LLM "stitch" call) to
    // avoid token truncation on long works.
    const finalManuscript = await workspaceExporter.readAllDrafts(
      story_id,
      version,
    );
    await workspaceExporter.saveManuscript(story_id, finalManuscript, version);

    return {
      content: [
        {
          type: "text",
          text: `Massive Expansion Complete! Generated ${drafted} scenes from the Beat Sheet and compiled the final ${target_length} manuscript for ${story_id}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running expand_to_novel: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
