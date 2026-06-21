import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { executeContinueNarrative } from "./continue-narrative.js";

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

    // 2. Auto-Draft the entire Beat Sheet
    // We will do a simple parse of the numbered list to figure out how many scenes to generate.
    // E.g. looking for lines starting with "1.", "2.", etc.
    const beatLines = beatSheetContent
      .split("\n")
      .filter((line) => /^\d+\./.test(line.trim()));
    const totalScenes = beatLines.length > 0 ? beatLines.length : 10; // fallback to 10 if parsing fails

    // Draft Scene 1 first (since continue_narrative needs a previous scene, we just use a generic call for the first one or we can just use continue_narrative but pass an empty previous scene)
    // To keep it simple, we will just run continueNarrative for all of them, but inject the specific Beat as the user_direction.
    for (let i = 1; i <= totalScenes; i++) {
      const beatDescription = beatLines[i - 1] || `Write scene ${i}`;

      await executeContinueNarrative({
        story_id: story_id,
        previous_scene_id: i === 1 ? "none" : `scene_${i - 1}`,
        next_scene_id: `scene_${i}`,
        user_direction: `Follow this beat perfectly: ${beatDescription}`,
        version: version,
      });
    }

    // 3. Compile the Manuscript
    // We simply concatenate them programmatically to avoid LLM token truncation limits
    const finalManuscript = await workspaceExporter.readAllDrafts(
      story_id,
      version,
    );
    await workspaceExporter.saveManuscript(story_id, finalManuscript, version);

    return {
      content: [
        {
          type: "text",
          text: `Massive Expansion Complete! Generated ${totalScenes} scenes from the Beat Sheet and compiled the final ${target_length} manuscript for ${story_id}.`,
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
