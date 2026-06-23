import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The skill is the single source of craft truth. These generation-relevant
 * references are loaded and injected into the WRITING prompts so the engine
 * applies the principles while drafting — instead of writing naive prose and
 * only discovering the craft at revision time. Edit the skill files to tune how
 * the engine writes.
 */
const CRAFT_FILES = [
  "00-master-core-directives.md",
  "04-agency-enforcement.md",
  "storyscope-anti-patterns.md",
];

/**
 * Anti-cliché naming rule, injected EVERYWHERE a name can be created — cast
 * generation AND scene writing — so the prose never falls back to the AI-default
 * register (the "Elara Voss" attractor) even when inventing an incidental name.
 */
export const NAMING_RULE = `NAMING: Never use the AI-default name register. Do NOT name any character Elara, Elinor, Lyra, Aria, Kael, Seraphina, Thalia, Cassius, Lior, or use surnames like Voss, Thorne, Vance, Blackwood, Hart, Ashford, Vale. Use the CANON CAST names exactly as given. If you must name an incidental character not in the cast, invent a name with concrete cultural, regional, and period specificity for THIS story's setting — never a generic fantasy default.`;

let cached: string | null = null;

export function loadCraftDirectives(): string {
  if (cached !== null) return cached;
  // project_root/skill/references — works from both src/ai and dist/ai.
  const root = path.resolve(__dirname, "../../skill/references");
  const parts: string[] = [];
  for (const f of CRAFT_FILES) {
    try {
      parts.push(fs.readFileSync(path.join(root, f), "utf8").trim());
    } catch {
      /* skip a missing reference */
    }
  }
  cached =
    parts.join("\n\n---\n\n").trim() ||
    "Write with specificity, earned emotion, and active characters. Avoid cliché, moralizing, and telling-not-showing.";
  return cached;
}
