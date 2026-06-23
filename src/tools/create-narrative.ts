import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { chromaStorage } from "../storage/chroma.js";
import { executeContinueNarrative } from "./continue-narrative.js";
import { generateAndSeedCast } from "./_cast.js";
import { recordSceneTracking } from "./_tracking.js";
import { executeBuildWorldBible } from "./build-world-bible.js";
import { DIAGNOSTIC_SCORE_BLOCK } from "../ai/extract.js";
import { loadCraftDirectives, NAMING_RULE } from "../ai/craft.js";

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

  const desiredName =
    story_name ||
    logline
      .split(" ")
      .slice(0, 4)
      .join("_")
      .replace(/[^a-zA-Z0-9_]/g, "");

  try {
    // "create" must always make a NEW story folder, never write into an existing
    // one (that's continue_narrative's job). Uniquify the name on collision.
    const storyName = await workspaceExporter.uniqueStoryName(desiredName);

    // 1. Cast FIRST, so character names are canonical and everything downstream
    // (architecture, scene drafting) references the same actors — fixing the
    // gap where the graph seeded one cast but the prose invented another.
    const cast = await generateAndSeedCast(storyName, logline);
    const castBrief = cast
      .map(
        (c) =>
          `- ${c.meta.name} — ${c.meta.role}; archetype: ${c.meta.archetype}; hamartia: ${c.meta.hamartia}`,
      )
      .join("\n");

    // 2. Architecture brief, referencing the established cast (keeps names
    // consistent — no more "Elena" in the brief vs "Elara" in the prose).
    const archPrompt = `You are an expert story architect. Build a story architecture brief for a ${genre} story with a ${tone} tone.
Logline: ${logline}

Use ONLY this established cast. Do NOT invent any new named character — every role (antagonist, mentor, family member, love interest, etc.) must be filled by one of these characters or left unnamed/incidental. If the premise implies one person occupies multiple roles (e.g. the antagonist is also a relative), map them to a SINGLE cast member; never split one conceptual person into two named characters.
${castBrief}`;
    const architecture = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: archPrompt,
      userMessage: "Generate the Architecture Brief.",
    });
    await workspaceExporter.saveArchitectureBrief(storyName, architecture);

    // 3. World Bible — establishes the canon RULES of the world so its logic is
    // consistent across scenes (prevents each scene reinventing the physics).
    let worldBible = "";
    try {
      await executeBuildWorldBible({
        story_id: storyName,
        world_premise: `${logline}\n\nGenre: ${genre}. Tone: ${tone}.`,
      });
      worldBible = (await workspaceExporter.readWorldBible(storyName)) || "";
    } catch {
      worldBible = "";
    }

    // 4. Draft Scene 1 — using the canon cast and obeying the world rules.
    const draftPrompt = `Write the opening scene for this story.
Logline: ${logline}
Tone: ${tone}

=== CRAFT DIRECTIVES (apply these WHILE writing) ===
${loadCraftDirectives()}

=== WORLD BIBLE (canon rules — never violate) ===
${worldBible || "(none yet)"}

CANON CAST — use these characters by name; do NOT invent new named primary characters:
${castBrief}

${NAMING_RULE}`;
    const draft = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: draftPrompt,
      userMessage: `Write Scene 1. Use these EXACT character names — do NOT invent or rename anyone: ${cast
        .map((c) => `${c.meta.name} (${c.meta.role})`)
        .join("; ")}. The point-of-view protagonist is ${cast[0]?.meta?.name || "the protagonist"} — refer to her/him by that exact name throughout.`,
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
    const diagPrompt = `Analyze the following scene for emotional pacing (cortisol, oxytocin, dopamine).\nScene:\n${draft}${DIAGNOSTIC_SCORE_BLOCK}`;
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

    // Track scene 1 (initial scratchpads + affect baseline-from-action), so
    // every later scene has a real continuity sheet to read back.
    await recordSceneTracking(
      storyName,
      "scene_1",
      draft,
      castBrief,
      cast.map((c) => ({ name: c.meta.name, role: c.meta.role })),
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
              .join(
                ", ",
              )}. Generated ${maxScenes} scenes and compiled the final manuscript for ${storyName}.`,
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
