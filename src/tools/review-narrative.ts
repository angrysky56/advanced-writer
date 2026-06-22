import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { DIAGNOSTIC_SCORE_BLOCK } from "../ai/extract.js";

export const reviewNarrativeDef = {
  name: "review_narrative",
  description:
    "Run neurochemical scoring, pathology diagnostics, and agency enforcement on existing text. Produces a structured neuro-critique report.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The narrative text to review" },
      scope: {
        type: "string",
        enum: ["scene", "chapter", "full"],
        default: "scene",
      },
      story_id: {
        type: "string",
        description: "Optional — link review to existing story",
      },
      scene_id: { type: "string", description: "Identifier for the scene" },
    },
    required: ["text"],
  },
};

export async function executeReviewNarrative(args: any) {
  const {
    text,
    scope,
    story_id = "default_story",
    scene_id = "unknown_scene",
  } = args;

  try {
    const diagPrompt = `You are a neurochemical narrative editor. Analyze the following ${scope} for emotional pacing (cortisol, oxytocin, dopamine), pathology diagnostics, and agency enforcement. Produce a structured neuro-critique report.\n\nText:\n${text}${DIAGNOSTIC_SCORE_BLOCK}`;

    const diagnosticReport = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: diagPrompt,
      userMessage: "Generate the neuro-critique report.",
    });

    await workspaceExporter.saveDiagnosticReport(
      story_id,
      scene_id,
      diagnosticReport,
    );

    return {
      content: [
        {
          type: "text",
          text: `Diagnostic report generated and saved for story: ${story_id}, scene: ${scene_id}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running review_narrative: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
