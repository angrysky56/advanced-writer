import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { chromaStorage } from "../storage/chroma.js";
import { DIAGNOSTIC_SCORE_BLOCK } from "../ai/extract.js";
import {
  recordSceneTracking,
  buildScratchpadContext,
} from "./_tracking.js";

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
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately. Poll with check_job.",
        default: false,
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
    version = "v1",
  } = args;

  try {
    const architecture =
      (await workspaceExporter.readArchitectureBrief(story_id)) ||
      "Architecture brief not found.";
    const rawPrevious = await workspaceExporter.readDraft(
      story_id,
      previous_scene_id,
      version,
    );
    const isFreshStart =
      !previous_scene_id ||
      ["none", "start", "n/a", "0"].includes(
        String(previous_scene_id).toLowerCase(),
      );
    if (!rawPrevious && !isFreshStart) {
      // Fail loud: generating from a missing predecessor produces disconnected
      // scenes and breaks continuity for the rest of an auto-draft run.
      return {
        content: [
          {
            type: "text",
            text: `Error: previous scene '${previous_scene_id}' not found for story '${story_id}' (version ${version}). Refusing to generate a disconnected scene.`,
          },
        ],
        isError: true,
      };
    }
    const previousScene =
      rawPrevious ||
      "(This is the opening scene — there is no previous scene yet.)";

    // Initialize Chroma client if needed (it handles getOrCreate inside)
    await chromaStorage
      .initialize()
      .catch(() => console.warn("Chroma init failed"));

    // Fetch the Living Graph State
    const storyState = await neo4jStorage.getStoryState(story_id);
    const graphStateContext = JSON.stringify(storyState, null, 2);

    // Explicit canon cast list so the model keeps using the SEEDED characters
    // (the ones the affect system tracks) instead of inventing fresh names.
    const canonCast =
      (storyState.characters || [])
        .map(
          (c: any) =>
            `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.archetype ? `, ${c.archetype}` : ""}`,
        )
        .join("\n") || "No cast on record yet.";

    // Each character's living continuity sheet, read back before writing.
    const scratchpadContext = buildScratchpadContext(storyState.characters || []);

    const semanticScenes = await chromaStorage.searchScenes(
      user_direction || "next scene",
      2,
    );
    const plotContext =
      semanticScenes.length > 0
        ? semanticScenes.join("\n\n---\n\n")
        : "No relevant past scenes found in Vector DB.";

    const semanticLore = await chromaStorage.searchLore(
      user_direction || "next scene",
      3,
    );
    const worldLoreContext =
      semanticLore.length > 0
        ? semanticLore.join("\n\n---\n\n")
        : "No relevant world lore found.";

    const systemPrompt = `You are a masterful storyteller. Your task is to write the NEXT scene in this story.

=== ARCHITECTURE BRIEF ===
${architecture}

=== WORLD BIBLE LORE ===
${worldLoreContext}

=== CANON CAST (use ONLY these as named characters; do NOT introduce new named primary characters) ===
${canonCast}

=== CHARACTER STATE SHEETS (continuity bible — each character's CURRENT state; maintain these and do NOT contradict them) ===
${scratchpadContext}

=== GRAPH DB STORY STATE (CHARACTERS, ENTITIES, RELATIONSHIPS) ===
${graphStateContext}

=== VECTOR DB RELEVANT SCENES ===
${plotContext}

=== PREVIOUS SCENE (${previous_scene_id}) ===
${previousScene}

=== USER DIRECTION / FEEDBACK ===
${user_direction || "Continue the narrative naturally, maintaining the tone, character voices, and momentum."}

Maintain the established prose style. Do not summarize the previous scene; pick up where it left off or transition smoothly to the next logical point in the story.
Use ONLY the canon cast above for named characters — develop them, do not replace them with newly-invented primary characters.
Honor the CHARACTER STATE SHEETS: each character's location, what they know, what they are holding, and their relationships must stay consistent with their recorded state unless this scene deliberately changes them (and if it does, the change must be shown).
CRITICAL FORMATTING RULE: Do NOT use markdown code blocks (triple backticks) for AI dialogue or output. If CodeWhisper communicates in code, integrate it naturally into the prose (e.g., using italics or standard quotes). The final output must read like a traditional novel, not a GitHub README.`;

    const newDraft = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt,
      userMessage: `Write the new scene (${next_scene_id}).`,
    });

    await workspaceExporter.saveDraft(
      story_id,
      next_scene_id,
      newDraft,
      version,
    );

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
    const diagPrompt = `Analyze the following scene for emotional pacing (cortisol, oxytocin, dopamine).\nScene:\n${newDraft}${DIAGNOSTIC_SCORE_BLOCK}`;
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

    // Continuity supervisor: merge each present character's state sheet, record
    // their affect snapshot, arc beat, and any new entities/relationships.
    await recordSceneTracking(
      story_id,
      next_scene_id,
      newDraft,
      canonCast,
      storyState.characters || [],
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
