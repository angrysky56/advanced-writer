import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { chromaStorage } from "../storage/chroma.js";
import { neo4jStorage } from "../storage/neo4j.js";

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
      cast_brief: {
        type: "string",
        description:
          "The story's ALREADY-ESTABLISHED canon cast (names + roles). The world bible must be built AROUND these characters and must NOT invent a different crew.",
      },
    },
    required: ["story_id", "world_premise"],
  },
};

export async function executeBuildWorldBible(args: any) {
  const { story_id, world_premise, cast_brief } = args;

  try {
    // The world bible MUST be built around the cast that was already seeded for
    // this story — otherwise the world-builder invents its own separate crew
    // (e.g. a Mars premise spawns "Yuri, Priya, Diego..." while the real cast is
    // "Tisa, Reek, Grease..."), producing two irreconcilable canons. When a cast
    // is provided, bind it hard: use these exact people, invent no new crew.
    // If the caller didn't pass one, recover it from the graph so the standalone
    // tool can't silently reintroduce the bug.
    let resolvedCast = cast_brief && cast_brief.trim() ? cast_brief : "";
    if (!resolvedCast) {
      try {
        const chars = await neo4jStorage.getCharactersForStory(story_id);
        if (chars && chars.length) {
          resolvedCast = chars
            .map(
              (c: any) =>
                `- ${c.name}${c.role ? ` — ${c.role}` : ""}${c.archetype ? `; archetype: ${c.archetype}` : ""}`,
            )
            .join("\n");
        }
      } catch {
        resolvedCast = "";
      }
    }

    const castBlock =
      resolvedCast && resolvedCast.trim()
        ? `

=== ESTABLISHED CANON CAST (already created — this world exists for THESE people) ===
${resolvedCast}

CRITICAL CAST RULE: Build the world AROUND the cast above. Wherever the world bible references the crew, the protagonists, the principal players, or the people inside the central situation, you MUST use these exact characters by their exact names and roles. Do NOT invent a different roster of named characters, do NOT rename them, and do NOT add new named principal characters. You may add unnamed background groups (a faceless corporation, an anonymous public) and offstage forces, but every named individual who belongs to the core situation must come from the cast above.`
        : "";

    const prompt = `You are a master world-builder. Your task is to lay out a STARTING OUTLINE for this story's world — a working framework, NOT immutable law. The story is written from the author's idea; this outline exists to keep global continuity and will be FILLED IN and refined as the prose actually establishes facts. So: sketch what the premise clearly implies, stay internally coherent, and do NOT over-invent rigid specifics the author never asked for — leave room for the story to fill in.

=== PREMISE ===
${world_premise}${castBlock}

Break the outline into EXACTLY five sections. Keep it grounded and evocative, but treat every entry as provisional and extendable, not binding decree.
1. CORE RULES & CONSTRAINTS: The working logic of the world's central premise/mechanic — how it appears to work, its apparent limits and costs. State these clearly but as the current understanding, to be confirmed and extended by the story (not as inviolable law that overrides the author's intent).
2. FACTIONS & POWER: Who holds control? Who is rebelling?
3. TECH & MAGIC: What are the physical rules of the world? How do people survive?
4. ECONOMICS & POLITICS: How do people trade? What is the currency? What are the laws?
5. GEOGRAPHY & LOCATIONS: Describe the environment, architecture, and specific notable locations.

Format each section with a clear markdown heading (e.g. "## 1. CORE RULES & CONSTRAINTS"). Be internally consistent, but remember this is the seed outline the story will grow — not a cage.`;

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
