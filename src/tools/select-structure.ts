import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";

export const selectStructureDef = {
  name: "select_structure",
  description:
    "Interactively select the right structural framework (Truby, Dramatica, Kishōtenketsu, Fichtean) for a story based on its Designing Principle.",
  inputSchema: {
    type: "object",
    properties: {
      premise: { type: "string", description: "Story premise or logline" },
      designing_principle: {
        type: "string",
        description: "Optional — the abstract structural logic",
      },
      story_name: {
        type: "string",
        description: "Name of the story to export to",
      },
      mode: {
        type: "string",
        enum: ["brainstorm", "collaborative", "fast-auto"],
        default: "brainstorm",
      },
    },
  },
};

export async function executeSelectStructure(args: any) {
  const {
    premise,
    designing_principle = "None provided",
    story_name = "default_story",
  } = args;

  try {
    const structPrompt = `You are an expert story architect. Evaluate the following premise and designing principle, then select and outline the absolute best narrative framework (e.g., Truby's 22 Steps, Dramatica, Kishōtenketsu, Fichtean Curve, Hero's Journey) for this specific story.\n\nPremise: ${premise}\nDesigning Principle: ${designing_principle}`;

    const structureDoc = await aiRouter.generateCompletion({
      taskType: "generation",
      systemPrompt: structPrompt,
      userMessage: "Analyze and provide the structural framework brief.",
    });

    await workspaceExporter.saveArchitectureBrief(story_name, structureDoc);

    return {
      content: [
        {
          type: "text",
          text: `Structure brief successfully generated and saved to workspace for story: ${story_name}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running select_structure: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
