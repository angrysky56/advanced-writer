import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { storySlug } from "../storage/story-id.js";
import {
  extractCharacterMeta,
  formatAffectProfile,
  safeParseJson,
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
 * Generate a story-appropriate principal cast — the SIZE scales to the premise
 * (a two-hander gets two; an ensemble crew gets the whole crew plus the android,
 * the creature, a notable pet, etc.). Saves each prose profile, extracts REAL
 * identities, and seeds them into the graph under their real names/traits, then
 * wires a SHADOWS edge from the second-listed character to the protagonist.
 *
 * Shared by create_narrative and expand_to_novel so the graph "living state"
 * always matches the actual characters the continuity-extraction matches by name.
 */
export async function generateAndSeedCast(
  storyName: string,
  // The FULL author story idea (premise, characters, world, tone, beats) — NOT a
  // one-line logline. The cast is planned from the real idea so it matches the
  // story the author actually described.
  storyIdea: string,
): Promise<SeededCharacter[]> {
  // Canonicalize the story identity up front so the graph node ids and
  // story_ids match the workspace folder regardless of how the caller
  // formatted the name ("The Last Frequency" vs "the_last_frequency").
  storyName = storySlug(storyName);
  const logline = storyIdea;
  // 1. PLAN the COMPLETE roster up front. Count scales entirely to the story —
  // a two-hander returns two; an epic returns hundreds. There is NO cap and NO
  // fallback: if planning fails we abort so a story is never generated with the
  // wrong cast. Every named/individuated being is planned HERE, not mid-draft.
  const rosterPrompt = `You are a casting director. Read the premise and list the COMPLETE cast this story needs — EVERY named or distinctly individuated being, however many that is. Include protagonist(s), antagonist(s), the full ensemble/crew, named allies and minor named roles, AND significant non-human characters (an android, a creature, a sentient ship, a collective intelligence, a notable pet). Scale honestly to the premise: an intimate story may have two or three; an ensemble has dozens; an epic or chronicle (a war, a nation, a life with many followers) may have a hundred or more — list them ALL. EXCLUDE ONLY pure nameless background (a faceless crowd, a one-line unnamed waiter). Do not pad and do not truncate. List the protagonist FIRST.

Tag each with a "tier":
- "principal": POV characters, the antagonist, anyone who drives the plot or recurs heavily.
- "supporting": named characters who matter but appear in fewer scenes.

Output ONLY JSON:
{ "cast": [ { "tier": "principal" | "supporting", "role": "short role label, e.g. 'Protagonist — disgraced pilot', 'Android exobiologist', 'The Organism'", "brief": "one line: who they are and their narrative function" } ] }

Premise: ${logline}`;
  let roster: { role: string; brief: string; tier: string }[] = [];
  let rosterError = "";
  try {
    const rosterResp = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt: rosterPrompt,
      userMessage: "Output the COMPLETE cast roster as JSON.",
    });
    const parsed = safeParseJson<any>(rosterResp);
    if (parsed && Array.isArray(parsed.cast) && parsed.cast.length > 0) {
      roster = parsed.cast
        .filter((c: any) => c && c.role)
        .map((c: any) => ({
          role: String(c.role),
          brief: String(c.brief || ""),
          tier:
            String(c.tier || "").toLowerCase() === "supporting"
              ? "supporting"
              : "principal",
        }));
    } else {
      rosterError = "planner returned no usable 'cast' array";
    }
  } catch (e: any) {
    rosterError = e?.message || String(e);
  }
  if (roster.length === 0) {
    // Abort loudly — never silently ship a truncated or wrong cast.
    throw new Error(
      `Cast planning failed for "${storyName}": ${rosterError || "empty roster"}. Aborting before any story is generated.`,
    );
  }

  // 2. Generate + seed each roster member in one pass. Effort is TIERED:
  // principals get a full psychological profile; supporting roles get a light
  // sketch. To stay consistent without ballooning context on large casts, we
  // feed only a compact "Name — role" registry forward (not full profile text),
  // which is enough to prevent duplicate names while scaling to hundreds.
  const seeded: SeededCharacter[] = [];
  const usedSlugs = new Set<string>();
  const nameRegistry: string[] = [];

  // Remove any leaked prompt preamble before the profile's first heading
  // (e.g. "We are asked to generate a character profile..."). The profile is
  // required to begin with a "## Name" heading, so anything before it is noise.
  const stripProfilePreamble = (text: string): string => {
    const idx = (text || "").search(/^#{1,3}\s+/m);
    return idx > 0 ? text.slice(idx).trim() : (text || "").trim();
  };

  for (const member of roster) {
    const alreadyCast = nameRegistry.length
      ? `\n\n=== CHARACTERS ALREADY CAST (do NOT reuse, duplicate, or rename these) ===\n${nameRegistry.join("\n")}`
      : "";

    const prompt =
      member.tier === "supporting"
        ? `Based on this premise: ${logline}, write a LIGHT character sketch for a SUPPORTING role (keep it concise — this is not a lead).
ROLE: ${member.role}${member.brief ? `\nWHO THEY ARE: ${member.brief}` : ""}
Give them a distinct proper NAME. In one short paragraph cover: their narrative function, one defining trait, one flaw, and their dominant emotional drive.${alreadyCast}`
        : `Based on this premise: ${logline}, generate a deeply flawed character profile for this PRINCIPAL:
ROLE: ${member.role}${member.brief ? `\nWHO THEY ARE: ${member.brief}` : ""}
Give them a distinct proper NAME. Detail their core desires, archetype, hamartia, shadow self, moral weakness, and Panksepp affect profile.${alreadyCast}`;

    const raw = await aiRouter.generateCompletion({
      // Supporting sketches use the cheaper/faster brainstorm route.
      taskType: member.tier === "supporting" ? "brainstorm" : "generation",
      systemPrompt: prompt + FORMAT_RULES,
      userMessage: `Generate the ${member.tier} character profile for: ${member.role}.`,
    });

    const profile = stripProfilePreamble(raw);
    const meta = await extractCharacterMeta(profile, member.role);

    // Build a stable, unique file/id slug from the real name.
    let slug = nameSlug(meta.name) || nameSlug(member.role);
    if (usedSlugs.has(slug)) slug = `${slug}_${seeded.length + 1}`;
    usedSlugs.add(slug);

    // Append a consistent, parseable affect block so every profile carries real
    // all-seven-system Panksepp scores in a uniform place (not name-hash noise).
    const profileWithAffect = `${profile.trim()}\n\n${formatAffectProfile(meta)}`;
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

    // Seed a creation-time affect baseline so every character's arc starts with
    // a tracked point (otherwise a character only appears once they're updated
    // mid-draft, leaving single dots instead of a trajectory).
    try {
      await neo4jStorage.appendAffectSnapshot(
        storyName,
        meta.name,
        "baseline",
        meta.panksepp,
        meta.plutchik,
      );
    } catch {
      // Non-fatal.
    }

    seeded.push({ id, fileSlug: slug, profile, meta });
    nameRegistry.push(`${meta.name} — ${member.role}`);
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
