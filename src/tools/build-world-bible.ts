import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { chromaStorage } from "../storage/chroma.js";

export const buildWorldBibleDef = {
  name: "build_world_bible",
  description:
    "Expands a premise into a highly detailed World Bible including Factions, Tech/Magic, Economics, and Geography, and saves it to Vector Memory.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: {
        type: "string",
        description: "Identifier for the story/world",
      },
      world_premise: {
        type: "string",
        description: "The raw premise or logline of the world to build",
      },
    },
    required: ["story_id", "world_premise"],
  },
};

export async function executeBuildWorldBible(args: any) {
  const { story_id, world_premise } = args;

  try {
    const prompt = `You are a master world-builder. Your task is to expand the following premise into a deeply textured "World Bible."

=== PREMISE ===
${world_premise}

You must break down your world-building into EXACTLY four sections. Make the lore gritty, grounded, and rich with sensory details and political tension.
1. FACTIONS & POWER: Who holds control? Who is rebelling?
2. TECH & MAGIC: What are the physical rules of the world? How do people survive?
3. ECONOMICS & POLITICS: How do people trade? What is the currency? What are the laws?
4. GEOGRAPHY & LOCATIONS: Describe the environment, architecture, and specific notable locations.

Format each section with a clear markdown heading (e.g. "## 1. FACTIONS & POWER").`;

    const worldBible = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt: prompt,
      userMessage: "Generate the World Bible.",
    });

    await workspaceExporter.saveWorldBible(story_id, worldBible);

    // Split the world bible into chunks by markdown headings and save to Chroma
    await chromaStorage
      .initialize()
      .catch(() => console.warn("Chroma init failed"));

    // Very simple split by "## "
    const sections = worldBible.split(/(?=## \d\.)/);
    for (let i = 0; i < sections.length; i++) {
      const sectionText = sections[i].trim();
      if (sectionText.length > 20) {
        await chromaStorage.addLore(
          `${story_id}_lore_chunk_${i}`,
          story_id,
          sectionText,
        );
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `World Bible generated, saved to workspace, and embedded into Vector Database for story: ${story_id}.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        { type: "text", text: `Error building world bible: ${error.message}` },
      ],
      isError: true,
    };
  }
}
