import { aiRouter } from "../ai/router.js";
import {
  safeParseJson,
  parseDiagnosticBlock,
  type DiagnosticScores,
} from "../ai/extract.js";

/* ------------------------------------------------------------------ *
 * Deterministic line-diff stats — no AI, no deps. Answers "how much of
 * this scene actually changed?" so the changelog reports facts, not
 * assertions.
 * ------------------------------------------------------------------ */

export interface DiffStats {
  oldLines: number;
  newLines: number;
  addedLines: number;
  removedLines: number;
  changedPct: number; // % of the old scene's lines that were removed/replaced
  oldWords: number;
  newWords: number;
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** LCS-based line diff. Falls back to a multiset approximation for very
 *  long inputs so we never build a pathological O(n*m) table. */
export function lineDiffStats(oldText: string, newText: string): DiffStats {
  const a = (oldText || "").split("\n");
  const b = (newText || "").split("\n");
  let common = 0;

  if (a.length * b.length <= 4_000_000) {
    // Standard LCS on lines (space-optimized, two rows).
    let prev = new Array<number>(b.length + 1).fill(0);
    let curr = new Array<number>(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        curr[j] =
          a[i - 1] === b[j - 1]
            ? prev[j - 1] + 1
            : Math.max(prev[j], curr[j - 1]);
      }
      [prev, curr] = [curr, prev];
    }
    common = prev[b.length];
  } else {
    // Approximation: shared line multiset intersection.
    const counts = new Map<string, number>();
    for (const line of a) counts.set(line, (counts.get(line) || 0) + 1);
    for (const line of b) {
      const c = counts.get(line) || 0;
      if (c > 0) {
        common++;
        counts.set(line, c - 1);
      }
    }
  }

  const removedLines = a.length - common;
  const addedLines = b.length - common;
  const changedPct =
    a.length > 0 ? Math.round((removedLines / a.length) * 100) : 100;
  return {
    oldLines: a.length,
    newLines: b.length,
    addedLines,
    removedLines,
    changedPct,
    oldWords: countWords(oldText || ""),
    newWords: countWords(newText || ""),
  };
}

export function formatDiffStats(d: DiffStats): string {
  return `diff: +${d.addedLines}/-${d.removedLines} lines (~${d.changedPct}% of scene changed), ${d.oldWords} -> ${d.newWords} words`;
}

/* ------------------------------------------------------------------ *
 * Directive-completion verifier — the missing check. The consistency
 * gate checks canon and the diagnostic scores neurochemistry, but
 * nothing ever asked "did this rewrite actually DO what the directive
 * said?" This does, with citable evidence, so the changelog can report
 * PASS/FAIL per critique item instead of assuming success.
 * ------------------------------------------------------------------ */

export interface VerifyResult {
  verdict: "PASS" | "PARTIAL" | "FAIL" | "UNVERIFIED";
  evidence: string;
  remaining: string; // what still needs doing (feeds the retry prompt)
}

export async function verifyDirective(params: {
  directive: string;
  oldText: string;
  newText: string;
  opLabel?: string;
}): Promise<VerifyResult> {
  const prompt = `You are a revision auditor. Your ONLY job is to judge whether the revision directive below was actually accomplished in the NEW text relative to the OLD text. Do NOT judge general prose quality, style, or other issues — only directive completion.

Verdicts:
- PASS: the directive was fully accomplished AND nothing outside its scope was destroyed.
- PARTIAL: meaningfully attempted but incomplete.
- FAIL: the directive was not accomplished (or the text is materially unchanged where change was required).
- FAIL also applies when the NEW text REMOVES or materially degrades substantial content the directive did NOT ask to change (unrequested deletions of scenes-worth of prose, lost beats, lost imagery). Preservation of unflagged prose is part of the job; name what was lost in "remaining".

Output ONLY JSON:
{ "verdict": "PASS|PARTIAL|FAIL", "evidence": "1-2 sentences citing the specific change (or absence of change) that justifies the verdict", "remaining": "what still needs to be done; empty string if PASS" }

=== DIRECTIVE${params.opLabel ? ` (${params.opLabel})` : ""} ===
${params.directive}

=== OLD TEXT ===
${params.oldText}

=== NEW TEXT ===
${params.newText}`;

  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: prompt,
      userMessage: "Output the verification verdict as JSON.",
    });
    const data = safeParseJson<any>(resp);
    if (!data || !data.verdict)
      return {
        verdict: "UNVERIFIED",
        evidence: "verifier returned unparseable output",
        remaining: "",
      };
    const verdict = String(data.verdict).toUpperCase();
    return {
      verdict:
        verdict === "PASS" || verdict === "PARTIAL" || verdict === "FAIL"
          ? (verdict as VerifyResult["verdict"])
          : "UNVERIFIED",
      evidence: String(data.evidence || ""),
      remaining: String(data.remaining || ""),
    };
  } catch (e: any) {
    // Fail-open but HONESTLY: an unverified rewrite is still saved, but the
    // changelog says UNVERIFIED rather than pretending it passed.
    return {
      verdict: "UNVERIFIED",
      evidence: `verifier call failed: ${e?.message || e}`,
      remaining: "",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Anchored find/replace edits — surgical alternative to full-scene
 * rewrites for local fixes (a wrong number, an over-described motif,
 * one explanatory sentence). Preserves every other word of polished
 * prose by construction.
 * ------------------------------------------------------------------ */

export interface AnchoredEdit {
  find: string;
  replace: string;
}

export function applyAnchoredEdits(
  text: string,
  edits: AnchoredEdit[],
): { text: string; applied: number; failed: AnchoredEdit[] } {
  let out = text;
  let applied = 0;
  const failed: AnchoredEdit[] = [];

  for (const edit of edits) {
    const find = String(edit.find ?? "");
    const replace = String(edit.replace ?? "");
    if (!find) {
      failed.push(edit);
      continue;
    }
    // 1) Exact match.
    if (out.includes(find)) {
      out = out.replace(find, replace);
      applied++;
      continue;
    }
    // 2) Whitespace-tolerant match (models often normalize spacing/newlines).
    const pattern = find
      .split(/\s+/)
      .filter(Boolean)
      .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    if (pattern) {
      try {
        const re = new RegExp(pattern);
        if (re.test(out)) {
          out = out.replace(re, replace);
          applied++;
          continue;
        }
      } catch {
        /* fall through to failed */
      }
    }
    failed.push(edit);
  }

  return { text: out, applied, failed };
}

/* ------------------------------------------------------------------ *
 * Diagnostics digest + re-score comparison — the scene diagnostics
 * (cortisol/oxytocin/dopamine + pathology flags shown in the Studio
 * Inspector) were previously write-only: generated, re-scored, never
 * read by the review or the planner. These helpers make them a
 * first-class input and make each re-score report a measurable delta.
 * ------------------------------------------------------------------ */

/** One compact line per scene for prompt injection. Scenes without a parseable
 *  score block are skipped. */
export function diagnosticsDigest(
  diags: { sceneId: string; content: string }[],
): string {
  const lines: string[] = [];
  for (const d of diags) {
    const s = parseDiagnosticBlock(d.content);
    if (!s) continue;
    const sceneId = d.sceneId.replace(/^neuro-critique-/, "");
    lines.push(
      `${sceneId}: cortisol ${s.cortisol}, oxytocin ${s.oxytocin}, dopamine ${s.dopamine}${s.pathologies.length ? ` — PATHOLOGIES: ${s.pathologies.join(", ")}` : ""}`,
    );
  }
  return lines.join("\n");
}

/** Human-readable delta between two diagnostic reports for the changelog. */
export function diagnosticDelta(
  oldReport: string | null,
  newReport: string,
): string {
  const after = parseDiagnosticBlock(newReport);
  if (!after) return "diagnostic: re-scored (no machine block in new report)";
  const before = oldReport ? parseDiagnosticBlock(oldReport) : null;
  const scoreStr = (s: DiagnosticScores) =>
    `cortisol ${s.cortisol}, oxytocin ${s.oxytocin}, dopamine ${s.dopamine}`;
  if (!before) {
    return `diagnostic: scored — ${scoreStr(after)}${after.pathologies.length ? `; pathologies: ${after.pathologies.join(", ")}` : "; pathologies: none"}`;
  }
  const move = (label: string, a: number, b: number) =>
    a === b ? `${label} ${b}` : `${label} ${a}->${b}`;
  const cleared = before.pathologies.filter(
    (p) => !after.pathologies.includes(p),
  );
  const persists = before.pathologies.filter((p) =>
    after.pathologies.includes(p),
  );
  const introduced = after.pathologies.filter(
    (p) => !before.pathologies.includes(p),
  );
  const parts: string[] = [
    `${move("cortisol", before.cortisol, after.cortisol)}, ${move("oxytocin", before.oxytocin, after.oxytocin)}, ${move("dopamine", before.dopamine, after.dopamine)}`,
  ];
  if (cleared.length) parts.push(`cleared: ${cleared.join(", ")}`);
  if (persists.length) parts.push(`STILL FLAGGED: ${persists.join(", ")}`);
  if (introduced.length) parts.push(`NEW pathology: ${introduced.join(", ")}`);
  if (!cleared.length && !persists.length && !introduced.length)
    parts.push("pathologies: none");
  return `diagnostic: ${parts.join("; ")}`;
}

/* ------------------------------------------------------------------ *
 * Issue-id helper — stable kebab-case slugs for the cross-version
 * issue ledger.
 * ------------------------------------------------------------------ */

export function issueSlug(title: string): string {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled-issue"
  );
}
