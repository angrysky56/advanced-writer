import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { chromaStorage } from "../storage/chroma.js";

export const continueNarrativeDef = {
  name: "continue_narrative",
  description:
    "Continue drafting a story by generating the next scene based on the previous scene, the story architecture, and user direction.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: {
        type: "string",
        description:
          "The identifier for the story (e.g., An_AI_coding_assistant)",
      },
      previous_scene_id: {
        type: "string",
        description: "The identifier of the preceding scene (e.g., scene_1)",
      },
      next_scene_id: {
        type: "string",
        description: "The identifier to save the new scene as (e.g., scene_2)",
      },
      user_direction: {
        type: "string",
        description:
          "Optional feedback or direction for where the story should go next",
      },
    },
    required: ["story_id", "previous_scene_id", "next_scene_id"],
  },
};

export async function executeContinueNarrative(args: any) {
  const {
    story_id,
    previous_scene_id,
    next_scene_id,
    user_direction = "",
  } = args;

  try {
    const architecture =
      (await workspaceExporter.readArchitectureBrief(story_id)) ||
      "Architecture brief not found.";
    const previousScene =
      (await workspaceExporter.readDraft(story_id, previous_scene_id)) ||
      "Previous scene not found.";

    // Initialize Chroma client if needed (it handles getOrCreate inside)
    await chromaStorage
      .initialize()
      .catch(() => console.warn("Chroma init failed"));

    const characters = await neo4jStorage.getCharactersForStory(story_id);
    const characterContext =
      characters.length > 0
        ? JSON.stringify(characters, null, 2)
        : "No character profiles found in Graph DB.";

    const semanticScenes = await chromaStorage.searchScenes(
      user_direction || "next scene",
      2,
    );
    const plotContext =
      semanticScenes.length > 0
        ? semanticScenes.join("\\n\\n---\\n\\n")
        : "No relevant past scenes found in Vector DB.";

    const systemPrompt = `You are a masterful storyteller. Your task is to write the NEXT scene in this story.

=== ARCHITECTURE BRIEF ===
${architecture}

=== GRAPH DB CHARACTER PROFILES ===
${characterContext}

=== VECTOR DB RELEVANT SCENES ===
${plotContext}

=== PREVIOUS SCENE (${previous_scene_id}) ===
${previousScene}

=== USER DIRECTION / FEEDBACK ===
${user_direction || "Continue the narrative naturally, maintaining the tone, character voices, and momentum."}

Maintain the established prose style. Do not summarize the previous scene; pick up where it left off or transition smoothly to the next logical point in the story.`;

    const newDraft = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt,
      userMessage: `Write the new scene (${next_scene_id}).`,
    });

    await workspaceExporter.saveDraft(story_id, next_scene_id, newDraft);

    // Save the new draft to Chroma so it can be searched next time
    await chromaStorage.addScene({
      id: `${story_id}_${next_scene_id}`,
      document: newDraft,
      metadata: {
        story_id,
        scene_id: next_scene_id,
        created_at: new Date().toISOString(),
      },
    });

    // Automatically run diagnostic on the new scene
    const diagPrompt = `Analyze the following scene for emotional pacing (cortisol, oxytocin, dopamine).\nScene:\n${newDraft}`;
    const diagnostic = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: diagPrompt,
      userMessage: "Provide neuro-critique scoring.",
    });

    await workspaceExporter.saveDiagnosticReport(
      story_id,
      next_scene_id,
      diagnostic,
    );

    return {
      content: [
        {
          type: "text",
          text: `Successfully drafted ${next_scene_id} and saved it to the workspace for story: ${story_id}. Diagnostic report also generated.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running continue_narrative: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
