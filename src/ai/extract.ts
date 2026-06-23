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
  let text = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

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

/** Panksepp's seven primary affective systems (the drive layer). */
export const PANKSEPP_SYSTEMS = [
  "SEEKING",
  "FEAR",
  "RAGE",
  "LUST",
  "CARE",
  "PANIC_GRIEF",
  "PLAY",
] as const;

/** Plutchik's eight primary emotions (the felt-emotion layer). */
export const PLUTCHIK_EMOTIONS = [
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
  "anticipation",
] as const;

/** Opposed pairs on the wheel — both elevated at once = genuine ambivalence. */
export const PLUTCHIK_OPPOSITES: [string, string][] = [
  ["joy", "sadness"],
  ["trust", "disgust"],
  ["fear", "anger"],
  ["anticipation", "surprise"],
];

/**
 * All 24 Plutchik dyads — compound feelings from blending two primaries.
 * Primary (adjacent), secondary (2 apart), tertiary (3 apart).
 */
export const PLUTCHIK_DYADS: Record<string, [string, string]> = {
  // Primary
  love: ["joy", "trust"],
  submission: ["trust", "fear"],
  awe: ["fear", "surprise"],
  disapproval: ["surprise", "sadness"],
  remorse: ["sadness", "disgust"],
  contempt: ["disgust", "anger"],
  aggression: ["anger", "anticipation"],
  optimism: ["anticipation", "joy"],
  // Secondary
  envy: ["sadness", "anger"],
  sorrow: ["sadness", "fear"],
  disappointment: ["sadness", "surprise"],
  shame: ["fear", "disgust"],
  curiosity: ["surprise", "trust"],
  cynicism: ["disgust", "anticipation"],
  pride: ["anger", "joy"],
  delight: ["joy", "surprise"],
  // Tertiary
  anxiety: ["anticipation", "fear"],
  despair: ["fear", "sadness"],
  guilt: ["joy", "fear"],
  sentimentality: ["trust", "sadness"],
  morbidness: ["disgust", "sadness"],
  outrage: ["surprise", "anger"],
  dominance: ["anger", "trust"],
  ambivalence: ["trust", "anticipation"],
};

/** Three intensity tiers per primary emotion (low / mid / high on the wheel). */
export const PLUTCHIK_INTENSITY: Record<string, [string, string, string]> = {
  joy: ["serenity", "joy", "ecstasy"],
  trust: ["acceptance", "trust", "admiration"],
  fear: ["apprehension", "fear", "terror"],
  surprise: ["distraction", "surprise", "amazement"],
  sadness: ["pensiveness", "sadness", "grief"],
  disgust: ["boredom", "disgust", "loathing"],
  anger: ["annoyance", "anger", "rage"],
  anticipation: ["interest", "anticipation", "vigilance"],
};

/** Name the intensity tier of a primary emotion at a given 1-10 score. */
export function intensityLabel(emotion: string, score: number): string {
  const tiers = PLUTCHIK_INTENSITY[emotion];
  if (!tiers) return emotion;
  const s = clampScore(score);
  return s <= 3 ? tiers[0] : s <= 7 ? tiers[1] : tiers[2];
}

/** Derive felt compound emotions: a dyad fires when BOTH constituents are high. */
export function deriveDyads(
  plutchik: Record<string, number>,
  threshold = 6,
): { name: string; strength: number }[] {
  const out: { name: string; strength: number }[] = [];
  for (const [name, [a, b]] of Object.entries(PLUTCHIK_DYADS)) {
    const strength = Math.min(clampScore(plutchik[a]), clampScore(plutchik[b]));
    if (strength >= threshold) out.push({ name, strength });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

/** Opposed pairs both running high = internal conflict, not noise. */
export function detectAmbivalence(
  plutchik: Record<string, number>,
  threshold = 6,
): string[] {
  const out: string[] = [];
  for (const [a, b] of PLUTCHIK_OPPOSITES) {
    if (
      clampScore(plutchik[a]) >= threshold &&
      clampScore(plutchik[b]) >= threshold
    ) {
      out.push(`${a} ↔ ${b}`);
    }
  }
  return out;
}

/**
 * Appended to every neuro-critique prompt so each report ends with a
 * machine-readable block the UI can parse into REAL scores/pathologies — rather
 * than the UI fabricating them from a name hash.
 */
export const DIAGNOSTIC_SCORE_BLOCK = `

At the very END of your report, output this exact machine-readable block and nothing after it:
SCORES: cortisol=<1-10>, oxytocin=<1-10>, dopamine=<1-10>
PATHOLOGIES: <comma-separated subset of: Somatic Metaphor Cliché, False Protagonist Activity, Flatlining Dopamine, Moralizing Ending, Telling Not Showing, Purple Prose; or the single word none>`;

export interface CharacterMeta {
  name: string;
  archetype: string;
  hamartia: string;
  shadow: string;
  moral_weakness: string;
  individuation_state: string;
  role: string;
  panksepp_primary: string;
  /** Score 1-10 for each of the seven Panksepp systems (drives). */
  panksepp: Record<string, number>;
  /** Score 1-10 for each of Plutchik's eight primary emotions (felt state). */
  plutchik: Record<string, number>;
}

function clampScore(v: any, fallback = 5): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

/**
 * Render a consistent, machine-parseable affect block to append to every saved
 * character profile. This guarantees the UI reads real, uniform Panksepp scores
 * (all seven systems) regardless of how the prose above is formatted.
 */
export function formatAffectProfile(meta: CharacterMeta): string {
  const p = meta.panksepp || {};
  const e = meta.plutchik || {};
  const pankseppLines = PANKSEPP_SYSTEMS.map(
    (k) => `- ${k}: ${clampScore(p[k])}`,
  ).join("\n");
  const plutchikLines = PLUTCHIK_EMOTIONS.map(
    (k) =>
      `- ${k}: ${clampScore(e[k])} (${intensityLabel(k, clampScore(e[k]))})`,
  ).join("\n");

  const dyads = deriveDyads(e).slice(0, 6); // strongest compound feelings
  const dyadLine =
    dyads.length > 0
      ? dyads.map((d) => `${d.name} (${d.strength})`).join(", ")
      : "none pronounced";
  const ambivalence = detectAmbivalence(e);
  const ambLine = ambivalence.length > 0 ? ambivalence.join(", ") : "none";

  return (
    `## Affect Profile (Panksepp drives, 1-10)\n\nPrimary system: ${meta.panksepp_primary}\n\n${pankseppLines}\n\n` +
    `## Emotional State (Plutchik, 1-10)\n\n${plutchikLines}\n\n` +
    `Compound emotions (dyads): ${dyadLine}\n` +
    `Internal tension (opposed pairs): ${ambLine}\n`
  );
}

/**
 * Recover a character name from the profile's own markdown heading, used as a
 * fallback when the structured extractor fails to return one (so the graph
 * never stores "Unnamed Character" when the profile clearly names them).
 */
function nameFromProfile(profile: string): string {
  const m = (profile || "").match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  if (!m) return "";
  let n = m[1].replace(/[*_`#]/g, "").trim();
  n = n.replace(/^character\s+profile\s*[:\-—]\s*/i, "");
  n = n.replace(/\s*[—\-–:(].*$/, "").trim();
  return /[A-Za-z]/.test(n) ? n : "";
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
  "panksepp_primary": "the single dominant system: one of SEEKING, FEAR, RAGE, PANIC_GRIEF, PLAY, CARE, LUST",
  "panksepp": { "SEEKING": 5, "FEAR": 5, "RAGE": 5, "LUST": 5, "CARE": 5, "PANIC_GRIEF": 5, "PLAY": 5 },
  "plutchik": { "joy": 5, "trust": 5, "fear": 5, "surprise": 5, "sadness": 5, "disgust": 5, "anger": 5, "anticipation": 5 }
}
For "panksepp", score EVERY one of the seven systems 1-10 by how strongly it DRIVES this character (the primary should be highest). For "plutchik", score the character's baseline FELT emotion on all eight from 1-10. Do not include markdown formatting or commentary.`;

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
  // If the extractor missed the name, recover it from the profile heading.
  const extractedName = (
    parsed?.name ? String(parsed.name).trim() : ""
  ).replace(/^(unnamed|unknown).*/i, "");
  return {
    name: extractedName || nameFromProfile(profile) || "Unnamed Character",
    archetype: (parsed?.archetype || "Unknown").toString().trim(),
    hamartia: (parsed?.hamartia || "Unknown").toString().trim(),
    shadow: (parsed?.shadow || "Unknown").toString().trim(),
    moral_weakness: (parsed?.moral_weakness || "Unknown").toString().trim(),
    individuation_state: (parsed?.individuation_state || "Pre-Awareness")
      .toString()
      .trim(),
    role: (parsed?.role || fallbackRole).toString().trim(),
    panksepp_primary: (parsed?.panksepp_primary || "SEEKING").toString().trim(),
    panksepp: Object.fromEntries(
      PANKSEPP_SYSTEMS.map((k) => [k, clampScore(parsed?.panksepp?.[k])]),
    ),
    plutchik: Object.fromEntries(
      PLUTCHIK_EMOTIONS.map((k) => [k, clampScore(parsed?.plutchik?.[k])]),
    ),
  };
}
