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
// CURATED write-time set. Previously this was ALL TEN references (~12,800
// words) dumped into every scene prompt — which bloated context (a big reason
// scenes ran ~10 min) and made the model PERFORM the frameworks (the
// "Plutchik compound becomes a tic" / neurochemical-on-the-nose pathologies
// StoryScope flagged). The drafter now gets only the concise, generation-
// relevant principles. Dropped from write-time: the archetypal database
// (03, a lookup, not a writing rule), memory/tracking (06, an internal
// mechanism), the research summary (background), and the FULL neurochemical
// (01) and diagnostic (05) docs — those are EVALUATION criteria and still run
// post-scene via the consistency gate + diagnostic scorer, where they judge
// rather than dictate. Structural paradigms (02) live in the ARC planner.
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

// The STRUCTURE-relevant subset, injected into the ARC generator (which
// previously used none of the references — so it produced linear, theme-on-the-
// nose arcs with long falling action, exactly the pathologies these files were
// written to prevent). Curated (not the full 10-file dump) so the arc prompt
// stays focused on shape, agency, and anti-patterns.
const ARC_FILES = [
  "00-master-core-directives.md",
  "02-structural-paradigms.md",
  "04-agency-enforcement.md",
  "storyscope-anti-patterns.md",
];

function loadRefs(files: string[]): string {
  // project_root/skill/references — works from both src/ai and dist/ai.
  const root = path.resolve(__dirname, "../../skill/references");
  const parts: string[] = [];
  for (const f of files) {
    try {
      parts.push(fs.readFileSync(path.join(root, f), "utf8").trim());
    } catch {
      /* skip a missing reference */
    }
  }
  return parts.join("\n\n---\n\n").trim();
}

let cached: string | null = null;
let arcCached: string | null = null;

export function loadCraftDirectives(): string {
  if (cached === null) {
    cached =
      loadRefs(CRAFT_FILES) ||
      "Write with specificity, earned emotion, and active characters. Avoid cliché, moralizing, and telling-not-showing.";
  }
  return cached;
}

/** Structure-only craft directives for the ARC planner. */
export function loadArcDirectives(): string {
  if (arcCached === null) {
    arcCached =
      loadRefs(ARC_FILES) ||
      "Give the story a real shape with a late climax and brief resolution; vary structure; never moralize.";
  }
  return arcCached;
}
