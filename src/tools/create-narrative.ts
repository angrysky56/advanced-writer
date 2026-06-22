import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { chromaStorage } from "../storage/chroma.js";
import { executeContinueNarrative } from "./continue-narrative.js";
import { generateAndSeedCast } from "./_cast.js";

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
      story_name: {
        type: "string",
        description: "Identifier for the story to save under",
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended for fast-auto / long runs). Poll with check_job.",
        default: false,
      },
    },
    required: ["logline"],
  },
};

export async function executeCreateNarrative(args: any) {
  const { logline, genre, tone, story_name } = args;

  if (!logline || typeof logline !== "string") {
    return {
      content: [
        {
          type: "text",
          text: "Error: 'logline' is required to create a narrative.",
        },
      ],
      isError: true,
    };
  }

  const storyName =
    story_name ||
    logline
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

    // 2. Character cast — generated with REAL names/traits and seeded into the
    // graph so continuity updates (which match by name) actually land.
    const cast = await generateAndSeedCast(storyName, logline);

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

      let lastGood = 1;
      for (let i = 2; i <= maxScenes; i++) {
        const res: any = await executeContinueNarrative({
          story_id: storyName,
          previous_scene_id: `scene_${i - 1}`,
          next_scene_id: `scene_${i}`,
          user_direction: `Continue drafting scene ${i} of ${maxScenes} for a ${args.target_length}.`,
        });
        // Stop the chain on failure rather than silently producing orphaned
        // or disconnected scenes downstream.
        if (res?.isError) {
          return {
            content: [
              {
                type: "text",
                text: `create_narrative stopped at scene_${i}: ${res.content?.[0]?.text || "scene generation failed"}. Scenes 1-${lastGood} were drafted for ${storyName}; rerun continue_narrative from scene_${lastGood} to resume.`,
              },
            ],
            isError: true,
          };
        }
        lastGood = i;
      }

      // Compile programmatically (no LLM "stitch" call) to avoid token
      // truncation and content alteration on longer works.
      const finalManuscript = await workspaceExporter.readAllDrafts(storyName);
      await workspaceExporter.saveManuscript(storyName, finalManuscript);

      return {
        content: [
          {
            type: "text",
            text: `fast-auto workflow complete. Cast: ${cast
              .map((c) => c.meta.name)
              .join(", ")}. Generated ${maxScenes} scenes and compiled the final manuscript for ${storyName}.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `create_narrative workflow (scene 1) completed successfully. Cast: ${cast
            .map((c) => `${c.meta.name} (${c.meta.role})`)
            .join(", ")}. Output saved to workspace under story: ${storyName}`,
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
