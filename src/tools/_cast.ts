import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import {
  extractCharacterMeta,
  formatAffectProfile,
  CharacterMeta,
} from "../ai/extract.js";

// Appended to every character-generation prompt to keep profiles consistent and
// free of conversational preamble (e.g. "Excellent. Based on the logline...").
const FORMAT_RULES = `

OUTPUT RULES: Respond with ONLY the character profile in clean markdown, beginning directly with the character's name as an H2 heading (## Name). Do NOT include any preamble, acknowledgement, or meta commentary (no "Here is", "Certainly", "Based on the...", etc.). Use consistent section headings: Core Desire, Archetype, Hamartia, Shadow, Moral Weakness, Panksepp Affect.

NAMING: Avoid the overused AI-default register. Do NOT use first names like Elara, Elinor, Lyra, Aria, Kael, Seraphina, Thalia, or surnames like Voss, Thorne, Vance, Blackwood, Hart. Choose names with concrete cultural, regional, and period specificity appropriate to this story's setting — the kind a careful human author would pick, not the statistical average of "fantasy name."`;

export interface SeededCharacter {
  id: string;
  fileSlug: string;
  profile: string;
  meta: CharacterMeta;
}

function nameSlug(name: string): string {
  return name
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

/**
 * Generate a three-person cast (protagonist, co-star, supporting), save each
 * prose profile to the workspace, extract their REAL identities, and seed them
 * into the Neo4j graph under their real names/traits (not hardcoded
 * placeholders). Wires a SHADOWS edge from the co-star to the protagonist.
 *
 * Shared by create_narrative and expand_to_novel so the graph "living state"
 * always matches the actual characters — which is what the continuity-extraction
 * updates in continue_narrative match against by name.
 */
export async function generateAndSeedCast(
  storyName: string,
  logline: string,
): Promise<SeededCharacter[]> {
  // 1. Protagonist
  const protagonistPrompt = `Based on this logline: ${logline}, generate a deeply flawed Jungian character profile for the Protagonist.
Give them a distinct proper NAME. Detail their core desires, archetype, hamartia (tragic flaw), shadow self, moral weakness, and Panksepp affect profile (e.g. SEEKING, FEAR, RAGE, PANIC_GRIEF, PLAY, CARE).`;
  const protagonistProfile = await aiRouter.generateCompletion({
    taskType: "generation",
    systemPrompt: protagonistPrompt + FORMAT_RULES,
    userMessage: "Generate the protagonist character profile.",
  });

  // 2. Co-Star
  const costarPrompt = `Based on this logline: ${logline} and the Protagonist's profile below, generate a deeply flawed Jungian character profile for a Co-Star (a foil, rival, or antagonist) who creates strong thematic tension.
Give them a distinct proper NAME. Detail their core desires, archetype, hamartia, shadow self, moral weakness, and relationship to the Protagonist.

=== PROTAGONIST ===
${protagonistProfile}`;
  const costarProfile = await aiRouter.generateCompletion({
    taskType: "generation",
    systemPrompt: costarPrompt + FORMAT_RULES,
    userMessage: "Generate the co-star character profile.",
  });

  // 3. Supporting
  const supportingPrompt = `Based on this logline: ${logline} and the existing cast below, generate a Jungian character profile for a Supporting Character (e.g. mentor, sidekick, or witness) who aids or complicates the narrative.
Give them a distinct proper NAME. Detail their core desires, archetype, hamartia, shadow self, and Panksepp profile.

=== CAST ===
Protagonist:
${protagonistProfile}

Co-Star:
${costarProfile}`;
  const supportingProfile = await aiRouter.generateCompletion({
    taskType: "generation",
    systemPrompt: supportingPrompt + FORMAT_RULES,
    userMessage: "Generate the supporting character profile.",
  });

  const specs: { profile: string; fallbackRole: string }[] = [
    { profile: protagonistProfile, fallbackRole: "Protagonist" },
    { profile: costarProfile, fallbackRole: "Co-Star" },
    { profile: supportingProfile, fallbackRole: "Supporting" },
  ];

  const seeded: SeededCharacter[] = [];
  const usedSlugs = new Set<string>();

  for (const spec of specs) {
    const meta = await extractCharacterMeta(spec.profile, spec.fallbackRole);

    // Build a stable, unique file/id slug from the real name.
    let slug = nameSlug(meta.name) || nameSlug(spec.fallbackRole);
    if (usedSlugs.has(slug)) slug = `${slug}_${seeded.length + 1}`;
    usedSlugs.add(slug);

    // Append a consistent, parseable affect block so every profile carries real
    // all-seven-system Panksepp scores in a uniform place (not name-hash noise).
    const profileWithAffect = `${spec.profile.trim()}\n\n${formatAffectProfile(meta)}`;
    await workspaceExporter.saveCharacterProfile(
      storyName,
      slug,
      profileWithAffect,
    );

    const id = `${storyName}_${slug}`;
    const now = new Date().toISOString();
    await neo4jStorage.createCharacterNode({
      id,
      document: profileWithAffect,
      metadata: {
        name: meta.name,
        archetype: meta.archetype,
        hamartia: meta.hamartia,
        shadow: meta.shadow,
        moral_weakness: meta.moral_weakness,
        individuation_state: meta.individuation_state,
        role: meta.role,
        panksepp_primary: meta.panksepp_primary,
        story_ids: [storyName],
        created_at: now,
        updated_at: now,
      },
    });

    seeded.push({ id, fileSlug: slug, profile: spec.profile, meta });
  }

  // Wire the archetypal shadow relationship: co-star shadows the protagonist.
  if (seeded.length >= 2) {
    try {
      await neo4jStorage.createShadowEdge(seeded[1].id, seeded[0].id);
    } catch {
      // Non-fatal: graph still usable without the edge.
    }
  }

  return seeded;
}
