import { aiRouter } from "./router.js";

/**
 * Robustly parse a JSON object out of an LLM response.
 *
 * Handles markdown code fences and leading/trailing prose by extracting the
 * outermost `{ ... }` span before parsing. Returns `null` on failure instead of
 * throwing, so callers can fall back gracefully.
 */
export function safeParseJson<T = any>(raw: string): T | null {
  if (!raw) return null;

  // Strip code fences if present.
  let text = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Narrow to the outermost JSON object if there is surrounding prose.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export interface CharacterMeta {
  name: string;
  archetype: string;
  hamartia: string;
  shadow: string;
  moral_weakness: string;
  individuation_state: string;
  role: string;
  panksepp_primary: string;
}

/**
 * Extract structured character metadata from a generated prose profile so it
 * can be stored in the graph with the character's REAL name and traits (rather
 * than hardcoded placeholders). Uses the cheap diagnostic model.
 *
 * @param profile  Full markdown character profile.
 * @param fallbackRole  Role to use if the model omits one (e.g. "Protagonist").
 */
export async function extractCharacterMeta(
  profile: string,
  fallbackRole = "Supporting",
): Promise<CharacterMeta> {
  const systemPrompt = `You are a strict data extractor. Read the character profile and output ONLY a JSON object with these exact keys:
{
  "name": "the character's proper name (invent a fitting one only if none is given)",
  "archetype": "their Jungian archetype",
  "hamartia": "their tragic flaw",
  "shadow": "their shadow self",
  "moral_weakness": "their core moral weakness",
  "individuation_state": "one of: Pre-Awareness, Awakening, Confrontation, Integration, Transcendence",
  "role": "their narrative role (e.g. Protagonist, Antagonist, Mentor)",
  "panksepp_primary": "one of: SEEKING, FEAR, RAGE, PANIC_GRIEF, PLAY, CARE, LUST"
}
Do not include markdown formatting or commentary.`;

  let parsed: Partial<CharacterMeta> | null = null;
  try {
    const response = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt,
      userMessage: profile,
      temperature: 0.1,
    });
    parsed = safeParseJson<Partial<CharacterMeta>>(response);
  } catch {
    parsed = null;
  }

  // Defensive defaults so the graph never stores empty/placeholder identities.
  return {
    name: (parsed?.name || "Unnamed Character").toString().trim(),
    archetype: (parsed?.archetype || "Unknown").toString().trim(),
    hamartia: (parsed?.hamartia || "Unknown").toString().trim(),
    shadow: (parsed?.shadow || "Unknown").toString().trim(),
    moral_weakness: (parsed?.moral_weakness || "Unknown").toString().trim(),
    individuation_state: (
      parsed?.individuation_state || "Pre-Awareness"
    )
      .toString()
      .trim(),
    role: (parsed?.role || fallbackRole).toString().trim(),
    panksepp_primary: (parsed?.panksepp_primary || "SEEKING")
      .toString()
      .trim(),
  };
}
