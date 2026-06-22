import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { extractCharacterMeta, formatAffectProfile } from "../ai/extract.js";

export const developCharacterDef = {
  name: "develop_character",
  description:
    "Create, update, query, list, or shadow-match characters in the persistent Archetypal Database.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "get", "list", "shadow_match"],
      },
      character_id: {
        type: "string",
        description: "For update/get/shadow_match",
      },
      name: { type: "string", description: "For create / update" },
      archetype: {
        type: "string",
        description: "For create / update — one of 12 Jungian archetypes",
      },
      story_name: {
        type: "string",
        description: "Story to associate this character with",
      },
      mode: {
        type: "string",
        enum: ["brainstorm", "collaborative", "fast-auto"],
        default: "brainstorm",
      },
    },
    required: ["action"],
  },
};

const text = (t: string, isError = false) => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});

function nameSlug(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

export async function executeDevelopCharacter(args: any) {
  const {
    action,
    name,
    archetype,
    character_id,
    story_name = "default_story",
  } = args;

  try {
    if (action === "create") {
      if (!name) return text("Error: 'name' is required to create a character.", true);

      const charPrompt = `You are a character psychology expert. Generate a deeply flawed Jungian character profile for a character named ${name}${archetype ? ` with the ${archetype} archetype` : ""}. Detail their core desires, archetype, hamartia, shadow self, moral weakness, and Panksepp affect profile.

OUTPUT RULES: Respond with ONLY the profile in clean markdown, beginning directly with the character's name as an H2 heading (## ${name}). No preamble, acknowledgement, or meta commentary.`;
      const characterDoc = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt: charPrompt,
        userMessage: "Generate the character profile.",
      });

      const slug = nameSlug(name);

      // Extract real traits, then append a consistent affect block (all seven
      // Panksepp systems) so the saved profile is uniform and parseable.
      const meta = await extractCharacterMeta(characterDoc, "Supporting");
      const docWithAffect = `${characterDoc.trim()}\n\n${formatAffectProfile(meta)}`;
      await workspaceExporter.saveCharacterProfile(
        story_name,
        slug,
        docWithAffect,
      );

      const now = new Date().toISOString();
      await neo4jStorage.createCharacterNode({
        id: `${story_name}_${slug}`,
        document: docWithAffect,
        metadata: {
          name, // user-provided name is authoritative
          archetype: archetype || meta.archetype,
          hamartia: meta.hamartia,
          shadow: meta.shadow,
          moral_weakness: meta.moral_weakness,
          individuation_state: meta.individuation_state,
          role: meta.role,
          panksepp_primary: meta.panksepp_primary,
          story_ids: [story_name],
          created_at: now,
          updated_at: now,
        },
      });

      return text(
        `Character "${name}" created (archetype: ${archetype || meta.archetype}, panksepp: ${meta.panksepp_primary}) and saved to ${story_name}.`,
      );
    }

    if (action === "get") {
      if (!character_id) return text("Error: 'character_id' is required for get.", true);
      const c = await neo4jStorage.getCharacterById(character_id);
      if (!c) return text(`No character found with id '${character_id}'.`, true);
      return text(JSON.stringify(c, null, 2));
    }

    if (action === "list") {
      const all = await neo4jStorage.listAllCharacters();
      if (all.length === 0) return text("The Archetypal Database is empty.");
      const lines = all.map(
        (c: any) =>
          `- ${c.name} [${c.id}] — ${c.archetype || "?"} / ${c.role || "?"} (stories: ${(c.story_ids || []).join(", ") || "none"})`,
      );
      return text(`Characters (${all.length}):\n${lines.join("\n")}`);
    }

    if (action === "update") {
      if (!character_id) return text("Error: 'character_id' is required for update.", true);
      const fields: Record<string, string> = {};
      if (name) fields.name = name;
      if (archetype) fields.archetype = archetype;
      const ok = await neo4jStorage.updateCharacterMeta(character_id, fields);
      return ok
        ? text(`Updated character '${character_id}'.`)
        : text(
            `No update applied to '${character_id}' (character not found or no recognized fields provided).`,
            true,
          );
    }

    if (action === "shadow_match") {
      if (!character_id) return text("Error: 'character_id' is required for shadow_match.", true);
      const target = await neo4jStorage.getCharacterById(character_id);
      if (!target) return text(`No character found with id '${character_id}'.`, true);
      const all = await neo4jStorage.listAllCharacters();
      const others = all.filter((c: any) => c.id !== character_id);
      if (others.length === 0)
        return text("No other characters to shadow-match against.");

      const roster = others
        .map((c: any) => `- ${c.name} [${c.id}]: ${c.archetype}; shadow=${c.shadow}; flaw=${c.hamartia}`)
        .join("\n");
      const matchPrompt = `Given the target character and a roster, pick the single best "shadow" foil — the character whose archetype/flaw most powerfully mirrors or opposes the target's. Explain briefly.

=== TARGET ===
${target.name}: ${target.archetype}; shadow=${target.shadow}; flaw=${target.hamartia}

=== ROSTER ===
${roster}`;
      const result = await aiRouter.generateCompletion({
        taskType: "brainstorm",
        systemPrompt: matchPrompt,
        userMessage: "Name the best shadow match and why.",
      });
      return text(result);
    }

    return text(`Unknown action '${action}'.`, true);
  } catch (error: any) {
    return text(`Error running develop_character: ${error.message}`, true);
  }
}
