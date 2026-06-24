import { aiRouter } from "../ai/router.js";
import { safeParseJson } from "../ai/extract.js";
import { ENV } from "../config.js";

export interface GateResult {
  text: string;
  passed: boolean;
  attempts: number;
  note: string;
}

/**
 * Check a freshly written scene against the world's HARD rules (the world bible
 * CORE RULES + the continuity ledger) and the beat's intent. Returns whether it
 * passes and, if not, a precise fix directive. This is a NARROW consistency gate
 * — not a full critique (that is StoryScope's job) — so it only flags genuine
 * rule violations, continuity contradictions, or a missed beat purpose.
 */
async function checkScene(
  worldBible: string,
  sceneText: string,
  beatDirective: string,
): Promise<{ pass: boolean; violations: string[]; fixDirective: string }> {
  const prompt = `You are a continuity & canon checker. Read the scene and decide ONLY whether it breaks any HARD constraint:
1. It contradicts a CORE RULE of the world (how the central mechanic works, its limits, what is impossible).
2. It contradicts an ESTABLISHED CONTINUITY fact already on record (places, prior events, objects, timeline).
3. It fails to deliver the BEAT's required purpose/turn (if a beat is given).
Do NOT flag style, taste, pacing, or prose quality — only hard consistency. Be conservative: if it's fine, pass it.

Output ONLY JSON:
{ "pass": true, "violations": ["specific rule/fact this scene breaks and where"], "fix_directive": "a precise instruction for revising ONLY the violating parts; empty if pass" }

=== WORLD BIBLE (CORE RULES + ESTABLISHED CONTINUITY) ===
${worldBible}

${beatDirective ? `=== THIS SCENE'S BEAT ===\n${beatDirective}\n` : ""}
=== SCENE ===
${sceneText}`;

  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: prompt,
      userMessage: "Output the consistency verdict as JSON.",
    });
    const data = safeParseJson<any>(resp);
    if (!data) return { pass: true, violations: [], fixDirective: "" };
    const violations = Array.isArray(data.violations)
      ? data.violations.map((v: any) => String(v)).filter(Boolean)
      : [];
    const pass = data.pass !== false && violations.length === 0;
    return {
      pass,
      violations,
      fixDirective: String(data.fix_directive || ""),
    };
  } catch {
    // If the checker itself errors, do not block the pipeline — pass through.
    return { pass: true, violations: [], fixDirective: "" };
  }
}

async function reviseScene(
  sceneText: string,
  worldBible: string,
  fixDirective: string,
  violations: string[],
): Promise<string> {
  const systemPrompt = `You are revising ONE scene to fix specific CONTINUITY/CANON violations while changing as little else as possible. Keep the prose, voice, tone, structure, and every consistent detail intact. Change ONLY what is needed to obey the rules below. Output the full revised scene prose only — no commentary.

=== RULES THIS SCENE MUST OBEY (world bible) ===
${worldBible}

=== VIOLATIONS TO FIX ===
${violations.map((v) => `- ${v}`).join("\n")}

=== FIX DIRECTIVE ===
${fixDirective}`;

  return aiRouter.generateCompletion({
    taskType: "generation",
    systemPrompt,
    userMessage: `Revise this scene to fix ONLY the listed violations, preserving everything else:\n\n${sceneText}`,
  });
}

/**
 * Enforce per-scene consistency: check the scene; if it violates a hard rule,
 * revise it (preserving everything else) and re-check, up to MAX_REWRITE_ITERATIONS.
 * Returns the accepted (or best-effort) text plus a note for the caller's log.
 * Best-effort and fail-open: a checker/revisor error never loses the scene.
 */
export async function enforceSceneConsistency(params: {
  sceneText: string;
  worldBible: string;
  beatDirective?: string;
}): Promise<GateResult> {
  const maxAttempts = Math.max(1, ENV.MAX_REWRITE_ITERATIONS || 3);
  let text = params.sceneText;
  const wb = params.worldBible || "";
  const beat = params.beatDirective || "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const verdict = await checkScene(wb, text, beat);
    if (verdict.pass) {
      return {
        text,
        passed: true,
        attempts: attempt - 1,
        note:
          attempt === 1
            ? "consistency gate: passed on first write"
            : `consistency gate: passed after ${attempt - 1} revision(s)`,
      };
    }
    // Last attempt and still failing -> keep the latest text, report honestly.
    if (attempt === maxAttempts) {
      return {
        text,
        passed: false,
        attempts: attempt,
        note: `consistency gate: still flags after ${attempt} attempt(s): ${verdict.violations.join("; ")}`,
      };
    }
    try {
      const revised = await reviseScene(
        text,
        wb,
        verdict.fixDirective,
        verdict.violations,
      );
      if (revised && revised.trim()) text = revised;
    } catch {
      // Revision failed — return what we have rather than dropping the scene.
      return {
        text,
        passed: false,
        attempts: attempt,
        note: `consistency gate: revision call failed; kept current draft`,
      };
    }
  }

  return { text, passed: false, attempts: maxAttempts, note: "consistency gate: exhausted" };
}
