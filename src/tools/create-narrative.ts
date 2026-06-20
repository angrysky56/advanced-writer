import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { chromaStorage } from "../storage/chroma.js";
import { executeContinueNarrative } from "./continue-narrative.js";

export const createNarrativeDef = {
  name: "create_narrative",
  description:
    "Build a complete narrative from a logline, premise, or raw idea. Runs an 8-step pipeline: intake -> hamartia -> framework -> characters -> architecture -> draft -> diagnostic.",
  inputSchema: {
    type: "object",
    properties: {
      logline: { type: "string", description: "One-sentence story premise" },
      genre: {
        type: "string",
        description: "Primary genre (e.g., literary fiction, sci-fi, thriller)",
      },
      tone: {
        type: "string",
        description: "Desired tone (e.g., dark, comedic, elegiac)",
      },
      target_length: {
        type: "string",
        enum: [
          "short_story",
          "novella",
          "novel",
          "screenplay",
          "book_of_poems",
        ],
      },
      mode: {
        type: "string",
        enum: ["brainstorm", "collaborative", "fast-auto"],
        default: "brainstorm",
      },
      existing_character_ids: {
        type: "array",
        items: { type: "string" },
        description: "Pull characters from the library",
      },
    },
  },
};

export async function executeCreateNarrative(args: any) {
  const { logline, genre, tone } = args;
  const storyName = logline
    .split(" ")
    .slice(0, 4)
    .join("_")
    .replace(/[^a-zA-Z0-9_]/g, "");

  try {
    // 1. Architecture
    const archPrompt = `You are an expert story architect. Build a story architecture brief for a ${genre} story with a ${tone} tone.\nLogline: ${logline}`;
    const architecture = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: archPrompt,
      userMessage: "Generate the Architecture Brief.",
    });
    await workspaceExporter.saveArchitectureBrief(storyName, architecture);

    // 2. Main Character
    const charPrompt = `Based on this logline: ${logline}, generate a Jungian character profile for the protagonist.`;
    const character = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: charPrompt,
      userMessage: "Generate the protagonist character profile.",
    });
    await workspaceExporter.saveCharacterProfile(
      storyName,
      "protagonist",
      character,
    );

    // Save to Neo4j
    await neo4jStorage.createCharacterNode({
      id: `${storyName}_protagonist`,
      document: character,
      metadata: {
        name: "Protagonist",
        archetype: "The Hero",
        hamartia: "Hubris",
        shadow: "The Tyrant",
        moral_weakness: "Selfishness",
        individuation_state: "Pre-Awareness",
        role: "Main",
        panksepp_primary: "SEEKING",
        story_ids: [storyName],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    // 3. Draft Scene 1
    const draftPrompt = `Write the opening scene for this story.\nLogline: ${logline}\nTone: ${tone}`;
    const draft = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: draftPrompt,
      userMessage: "Write Scene 1.",
    });
    await workspaceExporter.saveDraft(storyName, "scene_1", draft);

    await chromaStorage
      .initialize()
      .catch(() => console.warn("Chroma init failed"));
    await chromaStorage.addScene({
      id: `${storyName}_scene_1`,
      document: draft,
      metadata: {
        story_id: storyName,
        scene_id: "scene_1",
        created_at: new Date().toISOString(),
      },
    });

    // 4. Diagnostic
    const diagPrompt = `Analyze the following scene for emotional pacing (cortisol, oxytocin, dopamine).\nScene:\n${draft}`;
    const diagnostic = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: diagPrompt,
      userMessage: "Provide neuro-critique scoring.",
    });
    await workspaceExporter.saveDiagnosticReport(
      storyName,
      "scene_1",
      diagnostic,
    );

    if (args.mode === "fast-auto") {
      const targetCounts: Record<string, number> = {
        short_story: 3,
        book_of_poems: 4,
        novella: 5,
        screenplay: 5,
        novel: 8,
      };
      const maxScenes = targetCounts[args.target_length] || 3;

      for (let i = 2; i <= maxScenes; i++) {
        await executeContinueNarrative({
          story_id: storyName,
          previous_scene_id: `scene_${i - 1}`,
          next_scene_id: `scene_${i}`,
          user_direction: `Continue drafting scene ${i} of ${maxScenes} for a ${args.target_length}.`,
        });
      }

      const allDrafts = await workspaceExporter.readAllDrafts(storyName);
      const compilerPrompt = `You are an expert editor and formatter. Compile, rewrite, and stitch the following drafted scenes into a polished, cohesive final manuscript formatted as a ${args.target_length}. Ensure the formatting matches industry standards for a ${args.target_length}.\n\n=== DRAFTS ===\n${allDrafts}`;

      const finalManuscript = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: compilerPrompt,
        userMessage: "Compile the final manuscript.",
      });

      await workspaceExporter.saveManuscript(storyName, finalManuscript);

      return {
        content: [
          {
            type: "text",
            text: `fast-auto workflow complete. Generated ${maxScenes} scenes and compiled final manuscript for ${storyName}.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `create_narrative workflow (scene 1) completed successfully. Output saved to workspace under story: ${storyName}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running create_narrative: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
