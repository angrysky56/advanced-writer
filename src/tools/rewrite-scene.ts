import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson } from "../ai/extract.js";

export const rewriteSceneDef = {
  name: "rewrite_scene",
  description:
    "Targeted scene rewriting with before/after neurochemical scoring. Identifies specific pathologies and produces an improved version.",
  inputSchema: {
    type: "object",
    properties: {
      scene_text: { type: "string", description: "The scene to rewrite" },
      target_axis: {
        type: "string",
        enum: ["cortisol", "oxytocin", "dopamine"],
        description: "Which axis to prioritize raising",
      },
      story_id: {
        type: "string",
        description: "Optional — context from existing story",
      },
      scene_id: { type: "string", description: "Identifier for the scene" },
      character_ids: {
        type: "array",
        items: { type: "string" },
        description: "Characters in the scene",
      },
      version: {
        type: "string",
        description: "Draft version to write the rewrite to (default 'v1')",
        default: "v1",
      },
    },
    required: ["scene_text"],
  },
};

interface AxisScores {
  cortisol: number | null;
  oxytocin: number | null;
  dopamine: number | null;
}

/** Quick numeric scoring of the three neurochemical axes (1-10). */
async function scoreAxes(text: string): Promise<AxisScores> {
  try {
    const raw = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt:
        'Score the narrative text on three axes from 1-10. Output ONLY JSON: {"cortisol": <n>, "oxytocin": <n>, "dopamine": <n>}.',
      userMessage: text,
      temperature: 0.1,
    });
    const parsed = safeParseJson<AxisScores>(raw);
    return {
      cortisol: parsed?.cortisol ?? null,
      oxytocin: parsed?.oxytocin ?? null,
      dopamine: parsed?.dopamine ?? null,
    };
  } catch {
    return { cortisol: null, oxytocin: null, dopamine: null };
  }
}

function fmt(s: AxisScores): string {
  const v = (n: number | null) => (n === null ? "?" : String(n));
  return `cortisol ${v(s.cortisol)} / oxytocin ${v(s.oxytocin)} / dopamine ${v(s.dopamine)}`;
}

export async function executeRewriteScene(args: any) {
  const {
    scene_text,
    target_axis = "cortisol",
    story_id = "default_story",
    scene_id = "scene_rewrite",
    version = "v1",
  } = args;

  try {
    // 1. Score BEFORE
    const before = await scoreAxes(scene_text);

    // 2. Rewrite
    const rewritePrompt = `You are a masterful neurochemical editor. Rewrite the following scene to specifically enhance the ${target_axis} axis. Improve pacing, agency, and somatic metaphors.\n\nOriginal Scene:\n${scene_text}`;
    const rewrittenDraft = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: rewritePrompt,
      userMessage: "Provide the rewritten scene.",
    });

    await workspaceExporter.saveDraft(
      story_id,
      scene_id,
      rewrittenDraft,
      version,
    );

    // 3. Recompile that version's manuscript so the change shows in the draft.
    const compiled = await workspaceExporter.readAllDrafts(story_id, version);
    await workspaceExporter.saveManuscript(story_id, compiled, version);

    // 4. Score AFTER and persist the updated diagnostic.
    const after = await scoreAxes(rewrittenDraft);
    await workspaceExporter.saveDiagnosticReport(
      story_id,
      scene_id,
      `# Rewrite scoring (${scene_id})\n\nTarget axis: **${target_axis}**\n\n- Before: ${fmt(before)}\n- After: ${fmt(after)}\n`,
    );

    const beforeAxis = (before as any)[target_axis];
    const afterAxis = (after as any)[target_axis];
    const delta =
      typeof beforeAxis === "number" && typeof afterAxis === "number"
        ? ` (${target_axis} ${beforeAxis} → ${afterAxis})`
        : "";

    return {
      content: [
        {
          type: "text",
          text: `Scene rewritten focusing on ${target_axis}${delta} and saved to ${story_id}/${version}/${scene_id}; manuscript (${version}) recompiled. Before: ${fmt(before)}. After: ${fmt(after)}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        { type: "text", text: `Error running rewrite_scene: ${error.message}` },
      ],
      isError: true,
    };
  }
}
