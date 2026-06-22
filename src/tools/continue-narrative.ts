import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { chromaStorage } from "../storage/chroma.js";
import { safeParseJson } from "../ai/extract.js";

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

=== GRAPH DB STORY STATE (CHARACTERS, ENTITIES, RELATIONSHIPS) ===
${graphStateContext}

=== VECTOR DB RELEVANT SCENES ===
${plotContext}

=== PREVIOUS SCENE (${previous_scene_id}) ===
${previousScene}

=== USER DIRECTION / FEEDBACK ===
${user_direction || "Continue the narrative naturally, maintaining the tone, character voices, and momentum."}

Maintain the established prose style. Do not summarize the previous scene; pick up where it left off or transition smoothly to the next logical point in the story.
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

    // Run Continuity Extraction to update Neo4j
    const continuityPrompt = `You are a strict data extractor. Analyze the new scene and extract continuity state changes.
Output ONLY valid JSON matching this structure:
{
  "character_updates": [ {
    "name": "Character Name",
    "arc_progression": "What changed for them in this scene",
    "panksepp": { "SEEKING": 1-10, "FEAR": 1-10, "RAGE": 1-10, "LUST": 1-10, "CARE": 1-10, "PANIC_GRIEF": 1-10, "PLAY": 1-10 },
    "plutchik": { "joy": 1-10, "trust": 1-10, "fear": 1-10, "surprise": 1-10, "sadness": 1-10, "disgust": 1-10, "anger": 1-10, "anticipation": 1-10 }
  } ],
  "new_entities": [ { "name": "Entity Name", "type": "Animal/Prop/Location", "description": "Brief description" } ],
  "new_relationships": [ { "subject": "Name1", "relation": "OWNS/KNOWS/AT", "object": "Name2" } ]
}
For each character PRESENT in this scene, give their affect readings AS OF THIS SCENE (how this scene's events have moved them) so their emotional arc can be tracked over time. If no updates, return empty arrays. DO NOT include markdown formatting.
Scene:
${newDraft}`;
    const continuityExtraction = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: continuityPrompt,
      userMessage: "Extract continuity state.",
    });

    try {
      const stateData = safeParseJson<any>(continuityExtraction);
      if (!stateData) {
        console.warn("Continuity extraction returned no parseable JSON.");
      } else {
        if (Array.isArray(stateData.character_updates)) {
          for (const update of stateData.character_updates) {
            if (!update?.name) continue;
            await neo4jStorage.updateCharacterState(
              story_id,
              update.name,
              update.arc_progression || "",
            );
            // Record this scene's affect reading so the character's emotional
            // arc (Panksepp + Plutchik) is tracked across the whole story.
            if (update.panksepp || update.plutchik) {
              await neo4jStorage.appendAffectSnapshot(
                story_id,
                update.name,
                next_scene_id,
                update.panksepp || {},
                update.plutchik || {},
              );
            }
          }
        }
        if (Array.isArray(stateData.new_entities)) {
          for (const entity of stateData.new_entities) {
            if (!entity?.name) continue;
            await neo4jStorage.addEntity(
              story_id,
              entity.name,
              entity.type || "Thing",
              entity.description || "",
            );
          }
        }
        if (Array.isArray(stateData.new_relationships)) {
          for (const rel of stateData.new_relationships) {
            if (!rel?.subject || !rel?.object) continue;
            await neo4jStorage.addEntityRelationship(
              story_id,
              rel.subject,
              rel.object,
              rel.relation || "RELATED_TO",
            );
          }
        }
      }
    } catch (e) {
      console.warn("Failed to apply continuity extraction", e);
    }

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
