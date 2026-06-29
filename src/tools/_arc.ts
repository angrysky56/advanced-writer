import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { neo4jStorage } from "../storage/neo4j.js";
import { chromaStorage } from "../storage/chroma.js";
import { safeParseJson } from "../ai/extract.js";
import { storySlug } from "../storage/story-id.js";
import { loadArcDirectives } from "../ai/craft.js";

export interface Beat {
  order: number;
  act: string;
  title: string;
  summary: string;
  turn: string;
  characters_present: string[];
  location: string;
  establishes: string;
}

// Suggested beat count by length — guidance for scale, NOT a hard cap. The
// planner scales to the actual story; these just anchor the order of magnitude.
const BEAT_GUIDANCE: Record<string, string> = {
  short_story: "about 5-8 beats",
  novella: "about 12-20 beats",
  novel: "about 24-45 beats",
  screenplay: "about 8-15 sequence beats",
  book_of_poems: "about 8-20 beats (one per poem/movement)",
};

function formatBeatSheet(beats: Beat[]): string {
  const lines = beats.map(
    (b) =>
      `## Beat ${b.order}${b.act ? ` — ${b.act}` : ""}: ${b.title || "(untitled)"}\n` +
      `- **Summary:** ${b.summary || ""}\n` +
      `- **Dramatic turn:** ${b.turn || ""}\n` +
      `- **Characters present:** ${(b.characters_present || []).join(", ") || "—"}\n` +
      `- **Location:** ${b.location || "—"}\n` +
      `- **Establishes:** ${b.establishes || "—"}`,
  );
  return `# Story Arc — Beat Sheet\n\n${lines.join("\n\n")}\n`;
}

/**
 * Reconstruct full Beat objects from a saved beat-sheet.md. The graph
 * (getArc) is LOSSY — it never stored `establishes` and omits
 * `characters_present` — so resuming a run from the graph fed the drafter
 * thinner directives than the original run, producing a visible style/quality
 * seam at the resume boundary. The beat sheet keeps every field, so parsing it
 * back makes arc REUSE byte-for-byte equivalent to a fresh arc.
 */
export function parseBeatSheet(md: string): Beat[] {
  if (!md || !md.includes("## Beat")) return [];
  const blocks = md.split(/^##\s+Beat\s+/m).slice(1);
  const field = (block: string, label: string): string => {
    const m = block.match(
      new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n-\\s\\*\\*|\\n##\\s|$)`),
    );
    const v = (m?.[1] ?? "").trim();
    return v === "—" ? "" : v;
  };
  const beats: Beat[] = [];
  for (const block of blocks) {
    // Header line: "{order} — {act}: {title}"
    const header = (block.split("\n", 1)[0] || "").trim();
    const hm = header.match(/^(\d+)\s*(?:—\s*([^:]+):)?\s*(.*)$/);
    const order = hm ? parseInt(hm[1], 10) : beats.length + 1;
    const act = (hm?.[2] || "").trim();
    const title = (hm?.[3] || "").trim();
    const charsRaw = field(block, "Characters present");
    beats.push({
      order,
      act,
      title,
      summary: field(block, "Summary"),
      turn: field(block, "Dramatic turn"),
      characters_present: charsRaw
        ? charsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      location: field(block, "Location"),
      establishes: field(block, "Establishes"),
    });
  }
  return beats.sort((a, b) => a.order - b.order);
}

function normalizeBeats(raw: any[]): Beat[] {
  return raw
    .filter((b) => b && (b.summary || b.title))
    .map((b, i) => ({
      order: Number.isFinite(b.order) ? Math.trunc(b.order) : i + 1,
      act: String(b.act || ""),
      title: String(b.title || ""),
      summary: String(b.summary || ""),
      turn: String(b.turn || ""),
      characters_present: Array.isArray(b.characters_present)
        ? b.characters_present.map((c: any) => String(c)).filter(Boolean)
        : [],
      location: String(b.location || ""),
      establishes: String(b.establishes || ""),
    }))
    .sort((a, b) => a.order - b.order)
    .map((b, i) => ({ ...b, order: i + 1 })); // re-number to be dense & 1-based
}

/** Persist beats to the sheet, the graph (timeline + relations), and Chroma. */
async function persistArc(storyName: string, beats: Beat[]) {
  await workspaceExporter.saveBeatSheet(storyName, formatBeatSheet(beats));

  await chromaStorage
    .initialize()
    .catch(() => console.warn("Chroma init failed (arc)"));

  let prevId: string | null = null;
  for (const b of beats) {
    const id = await neo4jStorage.createBeatNode(storyName, b);
    if (prevId) await neo4jStorage.linkBeatNext(prevId, id);
    prevId = id;
    for (const name of b.characters_present) {
      try {
        await neo4jStorage.linkBeatCharacter(id, name, storyName);
      } catch {
        /* non-fatal */
      }
    }
    if (b.location) {
      try {
        await neo4jStorage.linkBeatLocation(id, b.location, storyName);
      } catch {
        /* non-fatal */
      }
    }
    try {
      await chromaStorage.addBeat(
        id,
        storyName,
        b.order,
        `Beat ${b.order} (${b.act}): ${b.title}. ${b.summary} Turn: ${b.turn}. Present: ${b.characters_present.join(", ")}. Location: ${b.location}.`,
      );
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * Generate the story's ARC SCAFFOLD — an ordered beat sheet bound to the cast
 * and world — and seed it into the sheet, the graph (a (:Beat)-[:NEXT]-> chain
 * with FEATURES/AT relations), and Chroma. This is the spine the draft loop
 * walks; each beat carries who is present, where, and what it must establish.
 */
export async function generateAndSeedArc(
  storyName: string,
  storyIdea: string,
  castBrief: string,
  worldBible: string,
  targetLength: string,
): Promise<Beat[]> {
  storyName = storySlug(storyName);
  const guidance = BEAT_GUIDANCE[targetLength] || "as many beats as the story needs";
  const prompt = `You are a master story architect. Build the ARC of this story as an ordered list of beats — the spine the writer will follow scene by scene. Honor the author's idea, the established cast, and the world. Apply the CRAFT DIRECTIVES below as you shape it. Scale to roughly ${guidance}, but serve the story, not the number.

=== CRAFT DIRECTIVES (apply these to the arc itself) ===
${loadArcDirectives()}

=== HARD STRUCTURAL RULES (override the generic template) ===
1. SHAPE — Use a Fichtean shape, NOT Freytag's pyramid. Place the CLIMAX very late — within the final ~15% of beats. Keep the RESOLUTION to at MOST one or two beats: do not linger; an extended denouement (three-plus falling-action beats covering one settled outcome) dissipates the tension you built. If the ending needs room, earn it with a real reversal, not repetition.
2. NONLINEARITY — The presentation order (sjuzet) may diverge from chronology (fabula). You may open in medias res, use flashback/flash-forward, interleave timelines, or delay a key revelation, where it genuinely serves the story. The 'order' field is PRESENTATION order; the underlying events must stay causally coherent. Do not default to a single-track chronological chain.
3. NO MORALIZING IN THE PLAN — The 'establishes' field must name what the beat concretely DOES for the plot, the world, or a character's state/relationship/knowledge — a function, not a message. Never write the story's theme, moral, or lesson into a beat (no "establishes the catharsis", no "shows that love conquers control"). The theme must stay implicit and be inferred from action; stating it here makes the drafter have characters voice it.
4. AGENCY — Every beat must turn on a character's choice that, made differently, would change the trajectory. No beat may be passive setup or a coincidence that rescues the protagonist.

For EACH beat give: the act/movement, a short title, a 1-2 sentence summary of what happens, the dramatic TURN (how the situation changes — what is different after), the characters PRESENT (use EXACT names from the cast), the primary LOCATION, and what the beat concretely ESTABLISHES/pays off in PLOT/WORLD/CHARACTER terms (a function, never the theme).

Use ONLY the established cast for named characters. Keep events causally coherent (even if presented out of order).

Output ONLY JSON:
{ "beats": [ { "order": 1, "act": "Act I / Setup", "title": "", "summary": "", "turn": "", "characters_present": ["Exact Name"], "location": "", "establishes": "" } ] }

=== AUTHOR'S STORY IDEA ===
${storyIdea}

=== ESTABLISHED CAST ===
${castBrief}

=== WORLD (rules & setting to respect) ===
${worldBible || "(world bible pending)"}`;

  let beats: Beat[] = [];
  let err = "";
  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "brainstorm",
      systemPrompt: prompt,
      userMessage: "Output the ordered beat sheet as JSON.",
    });
    const parsed = safeParseJson<any>(resp);
    if (parsed && Array.isArray(parsed.beats) && parsed.beats.length) {
      beats = normalizeBeats(parsed.beats);
    } else {
      err = "planner returned no usable 'beats' array";
    }
  } catch (e: any) {
    err = e?.message || String(e);
  }
  if (beats.length === 0) {
    throw new Error(
      `Arc planning failed for "${storyName}": ${err || "empty arc"}. Aborting before drafting.`,
    );
  }

  await persistArc(storyName, beats);
  return beats;
}

/**
 * Reason over the world model + arc for SELF-CONSISTENCY before any prose is
 * written: contradictions inside the CORE RULES, and beats that violate the
 * rules or each other (timeline impossibilities, a character in two places, an
 * event the rules forbid). Saves a report; if it finds hard problems it appends
 * rule clarifications to the world bible and folds beat fixes back into the arc.
 * Returns the (possibly corrected) beats.
 */
export async function checkWorldModelConsistency(
  storyName: string,
  worldBible: string,
  beats: Beat[],
): Promise<{ consistent: boolean; beats: Beat[]; report: string }> {
  storyName = storySlug(storyName);
  const arcText = beats
    .map(
      (b) =>
        `Beat ${b.order} (${b.act}) @ ${b.location} — ${b.summary} [turn: ${b.turn}] [present: ${b.characters_present.join(", ")}]`,
    )
    .join("\n");

  const prompt = `You are a meticulous story logician. Check this world model and arc for SELF-CONSISTENCY and physical/causal REASON. Find: (a) contradictions WITHIN the world's CORE RULES; (b) beats that violate a CORE RULE; (c) timeline or causality impossibilities across beats (a character in two places at once, an effect before its cause, travel/time that cannot happen, a payoff with no setup). Be precise and conservative — only flag genuine problems.

For each problem propose the MINIMAL fix. Prefer clarifying a rule or adjusting a beat over deleting story.

Output ONLY JSON:
{
  "consistent": true,
  "issues": [ { "type": "rule_contradiction|beat_violates_rule|timeline|causality", "where": "e.g. 'Beat 4' or 'CORE RULES'", "problem": "" } ],
  "rule_clarifications": [ "a sentence to ADD to the world bible's CORE RULES to remove ambiguity" ],
  "beat_fixes": [ { "order": 4, "fix": "how this beat's summary/turn should change to be consistent" } ]
}

=== WORLD BIBLE ===
${worldBible}

=== ARC ===
${arcText}`;

  let data: any = null;
  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: prompt,
      userMessage: "Output the consistency report as JSON.",
    });
    data = safeParseJson<any>(resp);
  } catch {
    data = null;
  }

  if (!data) {
    const report =
      "# World-Model Consistency\n\n(The consistency reasoner did not return a parseable report; proceeding without auto-repair.)\n";
    await workspaceExporter.saveConsistencyReport(storyName, report).catch(() => {});
    return { consistent: true, beats, report };
  }

  const issues: any[] = Array.isArray(data.issues) ? data.issues : [];
  const clarifications: string[] = Array.isArray(data.rule_clarifications)
    ? data.rule_clarifications.map((s: any) => String(s)).filter(Boolean)
    : [];
  const beatFixes: any[] = Array.isArray(data.beat_fixes) ? data.beat_fixes : [];
  const consistent = issues.length === 0 && data.consistent !== false;

  // Build the human report.
  const report =
    `# World-Model Consistency Report\n\n` +
    `Status: ${consistent ? "consistent ✓" : "issues found — repaired below"}\n\n` +
    (issues.length
      ? `## Issues\n${issues
          .map((i) => `- **${i.type}** @ ${i.where}: ${i.problem}`)
          .join("\n")}\n\n`
      : "") +
    (clarifications.length
      ? `## Rule clarifications added to world bible\n${clarifications.map((c) => `- ${c}`).join("\n")}\n\n`
      : "") +
    (beatFixes.length
      ? `## Beat fixes applied\n${beatFixes.map((f) => `- Beat ${f.order}: ${f.fix}`).join("\n")}\n`
      : "");
  await workspaceExporter.saveConsistencyReport(storyName, report).catch(() => {});

  if (consistent) return { consistent: true, beats, report };

  // Apply rule clarifications -> append to the world bible CORE RULES.
  if (clarifications.length) {
    const current = (await workspaceExporter.readWorldBible(storyName)) || worldBible;
    const addendum = `\n\n## CONSISTENCY ADDENDA (reasoned before drafting)\n\n${clarifications
      .map((c) => `- ${c}`)
      .join("\n")}\n`;
    await workspaceExporter
      .saveWorldBible(storyName, `${current.trimEnd()}${addendum}`)
      .catch(() => {});
  }

  // Apply beat fixes -> fold the fix into that beat's summary, then re-persist.
  let fixedBeats = beats;
  if (beatFixes.length) {
    const byOrder = new Map<number, string>();
    for (const f of beatFixes) {
      if (Number.isFinite(f?.order) && f?.fix)
        byOrder.set(Math.trunc(f.order), String(f.fix));
    }
    fixedBeats = beats.map((b) => {
      const fix = byOrder.get(b.order);
      return fix ? { ...b, summary: `${b.summary} (revised for consistency: ${fix})` } : b;
    });
    await persistArc(storyName, fixedBeats);
  }

  return { consistent: false, beats: fixedBeats, report };
}

/** A compact, prompt-ready directive for a single beat (for the draft loop). */
export function formatBeatDirective(b: Beat | null): string {
  if (!b) return "";
  return `BEAT ${b.order}${b.act ? ` — ${b.act}` : ""}: ${b.title}
What happens: ${b.summary}
The turn (what must be different after this scene): ${b.turn}
Characters present: ${(b.characters_present || []).join(", ") || "(as the scene requires from the canon cast)"}
Location: ${b.location || "(continuous from the previous scene)"}
This beat should establish/pay off: ${b.establishes || ""}`;
}
