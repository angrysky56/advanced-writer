import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson, DIAGNOSTIC_SCORE_BLOCK } from "../ai/extract.js";
import { loadCraftDirectives } from "../ai/craft.js";
import { enforceSceneConsistency } from "./_gate.js";
import {
  lineDiffStats,
  formatDiffStats,
  verifyDirective,
  applyAnchoredEdits,
  issueSlug,
  type AnchoredEdit,
  type VerifyResult,
} from "./_revision-support.js";

export const applyStoryscopeRevisionsDef = {
  name: "apply_storyscope_revisions",
  description:
    "Builds the next draft version from the StoryScope review. Non-destructive and auto-incrementing (v1->v2->v3...). The planner assigns each critique issue to EXACTLY ONE operation: 'rewrite' (full-scene revision), 'line_edit' (surgical anchored edits that preserve polished prose), 'cut_scene', 'merge_scenes', or 'add_scene' — so structural fixes the review asks for are actually executable. Every change is (a) checked against the World Bible's hard rules, (b) VERIFIED against its own directive (PASS/FAIL with cited evidence, retried with auditor feedback on FAIL), (c) re-scored on the neurochemical diagnostic, and (d) logged with deterministic diff stats. Ends with a COVERAGE REPORT mapping every critique item -> op -> scene -> verified status (including items it could NOT action, honestly), and updates the persistent cross-version issue ledger. Pass 'directives' to apply a human-approved/edited plan instead of the auto-generated one. This tool only revises PROSE — for canon reconciliation use reconcile_storyscope_canon.",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      source_version: {
        type: "string",
        description: "Draft version to read from (default: latest)",
      },
      target_version: {
        type: "string",
        description: "Draft version to write to (default: latest+1)",
      },
      directives: {
        type: "array",
        description:
          "Optional human-approved/edited revision plan (e.g. curated from the Executive Summary's REVISE PROSE bucket). When provided, this REPLACES the auto-generated plan entirely.",
        items: {
          type: "object",
          properties: {
            scene_id: { type: "string" },
            directive: { type: "string" },
            op: {
              type: "string",
              enum: [
                "rewrite",
                "line_edit",
                "cut_scene",
                "merge_scenes",
                "add_scene",
              ],
              description:
                "Operation type (default 'rewrite'). 'line_edit' = surgical anchored edits; 'cut_scene' = remove this scene; 'merge_scenes' = fuse scene_id with merge_with; 'add_scene' = new scene after after_scene.",
            },
            merge_with: {
              type: "string",
              description: "For merge_scenes: the scene to fuse INTO scene_id.",
            },
            after_scene: {
              type: "string",
              description: "For add_scene: the scene the new scene follows.",
            },
            issue_id: {
              type: "string",
              description:
                "Optional stable id linking this to the issue ledger.",
            },
          },
          required: ["scene_id", "directive"],
        },
      },
      exclude_scenes: {
        type: "array",
        description:
          "Optional list of scene_ids to force-skip even if the plan flags them — e.g. the user rejected that item.",
        items: { type: "string" },
      },
      async: {
        type: "boolean",
        description:
          "Run in the background and return a job id immediately (recommended for long manuscripts). Poll with check_job.",
        default: false,
      },
    },
    required: ["story_id"],
  },
};

type Op = "rewrite" | "line_edit" | "cut_scene" | "merge_scenes" | "add_scene";

interface PlanItem {
  issueId: string;
  op: Op;
  sceneId: string;
  mergeWith?: string;
  afterScene?: string;
  directive: string;
}

interface CoverageRow {
  issueId: string;
  op: string;
  scene: string;
  status: string; // done | failed | unactionable | excluded | skipped
  detail: string;
}

const VALID_OPS: Op[] = [
  "rewrite",
  "line_edit",
  "cut_scene",
  "merge_scenes",
  "add_scene",
];

const MAX_GEN_ATTEMPTS = 3; // transport-level retries per AI call
const MAX_VERIFY_ROUNDS = 2; // directive-verification retry loop

/** Generate with transport retries; returns "" only after all attempts fail. */
async function genWithRetries(
  systemPrompt: string,
  userMessage: string,
): Promise<{ text: string; error: string }> {
  let lastError = "model returned empty output";
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    try {
      const out = await aiRouter.generateCompletion({
        taskType: "generation",
        systemPrompt,
        userMessage,
      });
      if (out && out.trim()) return { text: out, error: "" };
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
    if (attempt < MAX_GEN_ATTEMPTS)
      await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return { text: "", error: lastError };
}

/** Pick a new scene id that sorts directly after `afterScene` under the
 *  numeric localeCompare used everywhere (scene_12 < scene_12_1 < scene_13). */
function newSceneId(afterScene: string, existing: Set<string>): string {
  let n = 1;
  let id = `${afterScene}_${n}`;
  while (existing.has(id) && n < 100) {
    n++;
    id = `${afterScene}_${n}`;
  }
  return id;
}

export async function executeApplyStoryscopeRevisions(args: any) {
  const { story_id } = args;

  try {
    // Auto-increment: each run builds Draft N+1 from the latest existing draft.
    const versions = await workspaceExporter.listDraftVersions(story_id);
    const latestNum = versions.length
      ? Math.max(
          ...versions.map((v) => parseInt(v.replace(/\D/g, ""), 10) || 1),
        )
      : 1;
    const source_version =
      args.source_version || (versions.length ? `v${latestNum}` : "v1");
    const target_version = args.target_version || `v${latestNum + 1}`;

    // 1. Read Executive Summary AND the full specialist lens reports for the
    // SOURCE version — the reviser must work from the critique of the exact
    // draft it is revising.
    const executiveSummary =
      await workspaceExporter.readStoryscopeExecutiveSummary(
        story_id,
        source_version,
      );
    const lensReports = await workspaceExporter.readAllStoryscopeReports(
      story_id,
      source_version,
    );
    const lensContext =
      lensReports.length > 0
        ? lensReports
            .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.content}`)
            .join("\n\n")
        : "(no specialist lens reports found)";

    const hasReview =
      !!(executiveSummary && executiveSummary.trim()) || lensReports.length > 0;
    if (!hasReview) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No StoryScope review found for ${story_id} (neither an executive summary nor lens reports exist on disk). Run storyscope_final_review first.`,
          },
        ],
        isError: true,
      };
    }
    const summaryContext =
      executiveSummary && executiveSummary.trim()
        ? executiveSummary
        : "(No executive summary file found — applying the specialist lens reports directly.)";

    // 2. Canonical scene set = the SOURCE version's scenes. (Earlier builds
    // unioned with v1 as a safety net, but now that cut_scene exists, that
    // union would RESURRECT scenes deliberately cut in a prior round.)
    let sceneFiles = await workspaceExporter.listDrafts(
      story_id,
      source_version,
    );
    if (sceneFiles.length === 0)
      sceneFiles = await workspaceExporter.listDrafts(story_id, "v1");
    const sceneIds = sceneFiles
      .map((f) => f.replace(".md", ""))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
    if (sceneIds.length === 0) {
      return {
        content: [
          { type: "text", text: `Error: No drafts found for ${story_id}.` },
        ],
        isError: true,
      };
    }
    const sceneSet = new Set(sceneIds);

    // 3. Collect short opening excerpts for the planner (no copying yet — the
    // copy-forward must happen AFTER planning so cut scenes are never copied).
    const excerpts: { sceneId: string; excerpt: string }[] = [];
    for (const sceneId of sceneIds) {
      let text = await workspaceExporter.readDraft(
        story_id,
        sceneId,
        source_version,
      );
      if (!text)
        text = await workspaceExporter.readDraft(story_id, sceneId, "v1");
      if (!text) continue;
      excerpts.push({
        sceneId,
        excerpt: text.slice(0, 400).replace(/\s+/g, " ").trim(),
      });
    }
    if (excerpts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: no scenes available to revise for ${story_id}.`,
          },
        ],
        isError: true,
      };
    }

    // 4. PLAN: human-approved directives, or one auto-planning call. Each
    // critique issue gets EXACTLY ONE owning operation — assigning the same fix
    // to two scenes manufactures the repetition the next review then flags.
    const coverage: CoverageRow[] = [];
    let rawItems: any[] = [];
    let planSource: "human-approved" | "auto" = "auto";

    const providedDirectives = Array.isArray(args.directives)
      ? args.directives
      : null;

    if (providedDirectives && providedDirectives.length > 0) {
      planSource = "human-approved";
      rawItems = providedDirectives;
    } else {
      const planPrompt = `You are an editorial planner. The AUTHOR'S INTENT IS PRIMARY and the manuscript is the living work; the Architecture Brief / World Bible are only earlier planning drafts. Flag work ONLY for genuine CRAFT problems — the story contradicting ITSELF, an arc that doesn't pay off, pacing/clarity failures, weak execution. DO NOT flag a scene merely because it diverges from the planning documents (canon updates belong to reconcile_storyscope_canon, not here).

You have FIVE operations. Choose the one that actually executes each critique item:
- "rewrite": full-scene revision — for pacing, structure, POV, or emotional-beat problems within ONE scene.
- "line_edit": surgical anchored edits — for LOCAL fixes (a factual/continuity error, an over-repeated description, an explanatory sentence to cut). STRONGLY PREFER this when the fix is local: it preserves polished prose by construction.
- "cut_scene": remove a scene the critique identifies as redundant (scene_id = the scene to cut).
- "merge_scenes": fuse two scenes into one (scene_id = the surviving scene, merge_with = the scene absorbed into it).
- "add_scene": a genuinely NEW scene the critique calls for (after_scene = the scene it follows; scene_id may repeat after_scene).

HARD RULES:
1. Each critique issue is owned by EXACTLY ONE operation. NEVER assign the same fix to two scenes — duplicated fixes create the repetition the next review will flag.
2. Give every item a short stable kebab-case "issue_id" naming the underlying issue (e.g. "takehiko-closure").
3. Scenes that already work must NOT be touched.
4. If an issue cannot be executed by any of these operations (needs human judgment, or is too ambiguous), list it under "unactionable" with the reason — NEVER pretend by assigning a token rewrite.

Output ONLY JSON:
{ "revisions": [ { "issue_id": "...", "op": "rewrite|line_edit|cut_scene|merge_scenes|add_scene", "scene_id": "scene_3", "merge_with": "(merge only)", "after_scene": "(add only)", "directive": "the specific change" } ],
  "unactionable": [ { "issue_id": "...", "reason": "..." } ] }

=== EXECUTIVE SUMMARY ===
${summaryContext}

=== SPECIALIST LENS REPORTS ===
${lensContext}

=== SCENES (id :: opening excerpt) ===
${excerpts.map((e) => `${e.sceneId} :: ${e.excerpt}`).join("\n\n")}`;

      let plan: any = null;
      try {
        const planResp = await aiRouter.generateCompletion({
          taskType: "diagnostic",
          systemPrompt: planPrompt,
          userMessage: "Output the revision plan as JSON.",
        });
        plan = safeParseJson<any>(planResp);
      } catch {
        plan = null;
      }
      if (plan && Array.isArray(plan.revisions)) rawItems = plan.revisions;
      if (plan && Array.isArray(plan.unactionable)) {
        for (const u of plan.unactionable) {
          coverage.push({
            issueId: String(u?.issue_id || "unknown"),
            op: "-",
            scene: "-",
            status: "unactionable",
            detail: String(u?.reason || "planner gave no reason"),
          });
        }
      }
    }

    // 4b. Normalize + validate the plan into executable items.
    const excludeSet = new Set<string>(
      Array.isArray(args.exclude_scenes)
        ? args.exclude_scenes.map((s: any) => String(s))
        : [],
    );

    const items: PlanItem[] = [];
    for (const r of rawItems) {
      if (!r || !r.scene_id) continue;
      const sceneId = String(r.scene_id);
      const directive = String(
        r.directive || "Apply the StoryScope critique relevant to this scene.",
      );
      const issueId = String(r.issue_id || issueSlug(directive.slice(0, 50)));
      let op: Op = VALID_OPS.includes(r.op) ? r.op : "rewrite";
      let mergeWith = r.merge_with ? String(r.merge_with) : undefined;
      let afterScene = r.after_scene ? String(r.after_scene) : undefined;

      if (excludeSet.has(sceneId)) {
        coverage.push({
          issueId,
          op,
          scene: sceneId,
          status: "excluded",
          detail: "user excluded this scene",
        });
        continue;
      }

      // Validate references against the actual scene set.
      if (op === "add_scene") {
        if (!afterScene || !sceneSet.has(afterScene)) {
          afterScene =
            sceneSet.has(sceneId) ? sceneId : sceneIds[sceneIds.length - 1];
        }
      } else if (!sceneSet.has(sceneId)) {
        coverage.push({
          issueId,
          op,
          scene: sceneId,
          status: "unactionable",
          detail: `plan referenced unknown scene '${sceneId}'`,
        });
        continue;
      }
      if (op === "merge_scenes" && (!mergeWith || !sceneSet.has(mergeWith))) {
        op = "rewrite"; // downgrade honestly rather than fail
        coverage.push({
          issueId,
          op: "merge_scenes->rewrite",
          scene: sceneId,
          status: "downgraded",
          detail: `merge_with '${mergeWith || "?"}' not found; treating as rewrite`,
        });
        mergeWith = undefined;
      }

      items.push({ issueId, op, sceneId, mergeWith, afterScene, directive });
    }

    // 4c. Resolve collisions: a cut wins over other ops on the same scene;
    // multiple rewrite/line_edit items on one scene are combined into ONE
    // rewrite so the scene is generated once with all its directives.
    const cutScenes = new Set(
      items.filter((i) => i.op === "cut_scene").map((i) => i.sceneId),
    );
    for (const i of items) {
      if (i.op === "merge_scenes" && i.mergeWith) cutScenes.add(i.mergeWith);
    }
    const finalItems: PlanItem[] = [];
    const bySceneRewrite = new Map<string, PlanItem>();
    for (const item of items) {
      if (item.op !== "cut_scene" && cutScenes.has(item.sceneId)) {
        coverage.push({
          issueId: item.issueId,
          op: item.op,
          scene: item.sceneId,
          status: "skipped",
          detail: "scene is being cut/merged away this round",
        });
        continue;
      }
      if (item.op === "rewrite" || item.op === "line_edit") {
        const existing = bySceneRewrite.get(item.sceneId);
        if (existing) {
          existing.op = "rewrite"; // combined directives ⇒ full revision
          existing.directive += `\n\nADDITIONALLY (${item.issueId}): ${item.directive}`;
          existing.issueId += `+${item.issueId}`;
          continue;
        }
        bySceneRewrite.set(item.sceneId, item);
      }
      finalItems.push(item);
    }

    // 5. COPY every surviving scene forward (cuts simply aren't copied — the
    // source version keeps them, so nothing is ever lost).
    const copiedIds: string[] = [];
    for (const sceneId of sceneIds) {
      if (cutScenes.has(sceneId)) continue;
      let text = await workspaceExporter.readDraft(
        story_id,
        sceneId,
        source_version,
      );
      if (!text)
        text = await workspaceExporter.readDraft(story_id, sceneId, "v1");
      if (!text) continue;
      await workspaceExporter.saveDraft(
        story_id,
        sceneId,
        text,
        target_version,
      );
      copiedIds.push(sceneId);
    }
    for (const sceneId of cutScenes) {
      const owner = finalItems.find(
        (i) =>
          (i.op === "cut_scene" && i.sceneId === sceneId) ||
          (i.op === "merge_scenes" && i.mergeWith === sceneId),
      );
      coverage.push({
        issueId: owner?.issueId || "unknown",
        op: owner?.op === "merge_scenes" ? "merge (absorbed)" : "cut_scene",
        scene: sceneId,
        status: "done",
        detail:
          owner?.op === "merge_scenes"
            ? `absorbed into ${owner.sceneId}`
            : `cut (still present in ${source_version})`,
      });
    }

    // Nothing to do beyond cuts?
    const contentItems = finalItems.filter((i) => i.op !== "cut_scene");
    if (contentItems.length === 0 && cutScenes.size === 0) {
      const compiled0 = await workspaceExporter.readAllDrafts(
        story_id,
        target_version,
      );
      await workspaceExporter.saveManuscript(
        story_id,
        compiled0,
        target_version,
      );
      return {
        content: [
          {
            type: "text",
            text: `${target_version} created from ${source_version} (${copiedIds.length} scenes carried forward). The planner flagged NO scenes as needing revision, so nothing was rewritten.${coverage.length ? `\n\nUnactioned items:\n${coverage.map((c) => `- [${c.issueId}] ${c.status}: ${c.detail}`).join("\n")}` : ""} If you expected changes, re-run storyscope_final_review or tell me which scenes to target.`,
          },
        ],
      };
    }

    // 6. Execute content operations.
    const worldBible = (await workspaceExporter.readWorldBible(story_id)) || "";
    const craftDirectives = loadCraftDirectives();
    const changelogLines: string[] = [];
    let revisedCount = 0;

    const currentIds = () =>
      copiedIds
        .slice()
        .sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        );

    const neighborContext = async (sceneId: string): Promise<string> => {
      const ids = currentIds();
      const idx = ids.indexOf(sceneId);
      const parts: string[] = [];
      if (idx > 0) {
        const prev = await workspaceExporter.readDraft(
          story_id,
          ids[idx - 1],
          target_version,
        );
        if (prev)
          parts.push(
            `PREVIOUS SCENE (${ids[idx - 1]}) ENDS WITH:\n...${prev.slice(-500).trim()}`,
          );
      }
      if (idx >= 0 && idx < ids.length - 1) {
        const next = await workspaceExporter.readDraft(
          story_id,
          ids[idx + 1],
          target_version,
        );
        if (next)
          parts.push(
            `NEXT SCENE (${ids[idx + 1]}) BEGINS WITH:\n${next.slice(0, 500).trim()}...`,
          );
      }
      return parts.length
        ? `\n\n=== BOUNDARY CONTEXT (do not contradict; your scene must flow from/into these) ===\n${parts.join("\n\n")}`
        : "";
    };

    const runGate = async (
      text: string,
      directive: string,
    ): Promise<{ text: string; note: string }> => {
      if (!worldBible.trim())
        return { text, note: "consistency gate: skipped (no World Bible on file)" };
      try {
        const g = await enforceSceneConsistency({
          sceneText: text,
          worldBible,
          beatDirective: directive,
        });
        return { text: g.text, note: g.note };
      } catch {
        return {
          text,
          note: "consistency gate: check failed (non-fatal); kept rewrite as-is",
        };
      }
    };

    const rescore = async (sceneId: string, text: string): Promise<string> => {
      try {
        const out = await aiRouter.generateCompletion({
          taskType: "diagnostic",
          systemPrompt: `Analyze the following revised scene for emotional pacing (cortisol, oxytocin, dopamine), pathology diagnostics, and agency enforcement. Produce a structured neuro-critique report.\nScene:\n${text}${DIAGNOSTIC_SCORE_BLOCK}`,
          userMessage: "Provide the updated neuro-critique report.",
        });
        if (out && out.trim()) {
          await workspaceExporter.saveDiagnosticReport(story_id, sceneId, out);
          return "diagnostic: re-scored";
        }
        return "diagnostic: re-score returned empty (non-fatal)";
      } catch {
        return "diagnostic: re-score call failed (non-fatal)";
      }
    };

    /** Generate → gate → VERIFY (retry with auditor feedback on FAIL). */
    const generateVerified = async (opts: {
      opLabel: string;
      directive: string;
      oldText: string; // "" for add_scene
      buildSystemPrompt: (feedback: string) => string;
      userMessage: string;
    }): Promise<{
      text: string;
      gateNote: string;
      verify: VerifyResult;
      error: string;
    }> => {
      let feedback = "";
      let last: { text: string; gateNote: string; verify: VerifyResult } | null =
        null;
      for (let round = 1; round <= MAX_VERIFY_ROUNDS; round++) {
        const gen = await genWithRetries(
          opts.buildSystemPrompt(feedback),
          opts.userMessage,
        );
        if (!gen.text) {
          if (last) break; // keep the earlier (verified-or-not) attempt
          return {
            text: "",
            gateNote: "",
            verify: {
              verdict: "UNVERIFIED",
              evidence: "",
              remaining: "",
            },
            error: gen.error,
          };
        }
        const gated = await runGate(gen.text, opts.directive);
        const verify = await verifyDirective({
          directive: opts.directive,
          oldText: opts.oldText || "(no prior text — this is a new scene)",
          newText: gated.text,
          opLabel: opts.opLabel,
        });
        last = { text: gated.text, gateNote: gated.note, verify };
        if (verify.verdict !== "FAIL") break;
        feedback = `\n\n=== PREVIOUS ATTEMPT FAILED VERIFICATION ===\nAn independent auditor compared your last attempt against the directive and found it was NOT accomplished.\nAuditor's evidence: ${verify.evidence}\nStill required: ${verify.remaining}\nRedo the work so the directive is unambiguously accomplished this time.`;
      }
      return { ...last!, error: "" };
    };

    const appendChangelog = async (note: string) => {
      const coverageTable =
        coverage.length > 0
          ? `\n\n### Coverage report (every critique item, honestly)\n\n| issue | op | scene(s) | status | detail |\n|---|---|---|---|---|\n${coverage
              .map(
                (c) =>
                  `| ${c.issueId} | ${c.op} | ${c.scene} | ${c.status} | ${c.detail.replace(/\|/g, "/").replace(/\n/g, " ")} |`,
              )
              .join("\n")}`
          : "";
      const entry = `## Apply revisions — ${new Date().toISOString()} (${note})

${source_version} -> ${target_version} | plan source: ${planSource}

${changelogLines.length ? changelogLines.join("\n") : "- No scenes were revised before this point."}${coverageTable}
`;
      try {
        await workspaceExporter.appendStoryscopeChangelog(
          story_id,
          source_version,
          entry,
        );
      } catch {
        /* changelog is best-effort — never block on it */
      }
    };

    const abortRun = async (sceneId: string, lastError: string) => {
      const partial = await workspaceExporter.readAllDrafts(
        story_id,
        target_version,
      );
      await workspaceExporter.saveManuscript(story_id, partial, target_version);
      await appendChangelog(`ABORTED at ${sceneId}: ${lastError}`);
      return {
        content: [
          {
            type: "text",
            text: `Revision ABORTED at ${sceneId} after ${MAX_GEN_ATTEMPTS} attempts: ${lastError}. ${revisedCount} of ${contentItems.length} planned operation(s) completed first; ${target_version} holds every scene (revised + originals) but the revision is INCOMPLETE. If this was a transient connection issue, rerun to continue; otherwise the model could not revise this scene.`,
          },
        ],
        isError: true,
      };
    };

    // Deterministic execution order: line_edits & rewrites & merges in scene
    // order, then adds (they need their neighbors' final text).
    const ordered = [
      ...contentItems
        .filter((i) => i.op !== "add_scene")
        .sort((a, b) =>
          a.sceneId.localeCompare(b.sceneId, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      ...contentItems.filter((i) => i.op === "add_scene"),
    ];

    for (const item of ordered) {
      /* ---------------- cut_scene: already handled at copy time ------- */
      if (item.op === "cut_scene") {
        changelogLines.push(
          `- **[${item.issueId}]** cut_scene ${item.sceneId}: ${item.directive}\n  - scene not carried into ${target_version} (recoverable from ${source_version})`,
        );
        revisedCount++;
        continue;
      }

      /* ---------------- add_scene ------------------------------------- */
      if (item.op === "add_scene") {
        const anchor = item.afterScene!;
        const anchorText =
          (await workspaceExporter.readDraft(
            story_id,
            anchor,
            target_version,
          )) || "";
        const ids = currentIds();
        const nextId = ids[ids.indexOf(anchor) + 1];
        const nextText = nextId
          ? (await workspaceExporter.readDraft(
              story_id,
              nextId,
              target_version,
            )) || ""
          : "";
        const freshId = newSceneId(anchor, new Set(copiedIds));

        const result = await generateVerified({
          opLabel: "add_scene",
          directive: item.directive,
          oldText: "",
          buildSystemPrompt: (feedback) =>
            `You are a brilliant MFA-level novelist writing ONE NEW scene that the editorial review requires. It sits between two existing scenes; it must flow seamlessly from the one before and into the one after, in the manuscript's established voice. Output the full scene prose only.

=== WHY THIS SCENE MUST EXIST (the directive) ===
${item.directive}

=== OVERALL CRITIQUE (context) ===
${summaryContext}

=== SCENE BEFORE (${anchor}) — yours follows this ===
${anchorText.slice(-3000)}

=== SCENE AFTER (${nextId || "(end of manuscript)"}) — yours leads into this ===
${nextText.slice(0, 2000)}

=== CRAFT DIRECTIVES ===
${craftDirectives}${feedback}`,
          userMessage: "Write the new scene.",
        });
        if (!result.text) return await abortRun(freshId, result.error);

        await workspaceExporter.saveDraft(
          story_id,
          freshId,
          result.text,
          target_version,
        );
        copiedIds.push(freshId);
        revisedCount++;
        const diag = await rescore(freshId, result.text);
        const d = lineDiffStats("", result.text);
        changelogLines.push(
          `- **[${item.issueId}]** add_scene ${freshId} (after ${anchor}): ${item.directive}\n  - ${result.gateNote}\n  - verify: ${result.verify.verdict}${result.verify.evidence ? ` — ${result.verify.evidence}` : ""}\n  - ${diag}\n  - ${formatDiffStats(d)}`,
        );
        coverage.push({
          issueId: item.issueId,
          op: "add_scene",
          scene: freshId,
          status: result.verify.verdict === "FAIL" ? "failed" : "done",
          detail: `verify: ${result.verify.verdict}`,
        });
        continue;
      }

      /* ---------------- merge_scenes ----------------------------------- */
      if (item.op === "merge_scenes") {
        const primaryText =
          (await workspaceExporter.readDraft(
            story_id,
            item.sceneId,
            target_version,
          )) || "";
        // The absorbed scene was never copied to target — read from source.
        let secondaryText =
          (await workspaceExporter.readDraft(
            story_id,
            item.mergeWith!,
            source_version,
          )) || "";
        if (!secondaryText)
          secondaryText =
            (await workspaceExporter.readDraft(
              story_id,
              item.mergeWith!,
              "v1",
            )) || "";
        const oldCombined = `${primaryText}\n\n${secondaryText}`;

        const result = await generateVerified({
          opLabel: "merge_scenes",
          directive: item.directive,
          oldText: oldCombined,
          buildSystemPrompt: (feedback) =>
            `You are a brilliant MFA-level editor FUSING two scenes into ONE stronger scene, per the directive. Preserve the best prose of both; eliminate the redundancy the critique identified; the result must read as a single continuous scene. Output the full merged scene prose only.

=== MERGE DIRECTIVE ===
${item.directive}

=== OVERALL CRITIQUE (context) ===
${summaryContext}

=== CRAFT DIRECTIVES ===
${craftDirectives}${feedback}`,
          userMessage: `Fuse these two scenes into one.\n\n=== SCENE A (${item.sceneId} — the merged scene keeps this position) ===\n${primaryText}\n\n=== SCENE B (${item.mergeWith} — being absorbed) ===\n${secondaryText}`,
        });
        if (!result.text) return await abortRun(item.sceneId, result.error);

        await workspaceExporter.saveDraft(
          story_id,
          item.sceneId,
          result.text,
          target_version,
        );
        revisedCount++;
        const diag = await rescore(item.sceneId, result.text);
        const d = lineDiffStats(oldCombined, result.text);
        changelogLines.push(
          `- **[${item.issueId}]** merge_scenes ${item.sceneId} <- ${item.mergeWith}: ${item.directive}\n  - ${result.gateNote}\n  - verify: ${result.verify.verdict}${result.verify.evidence ? ` — ${result.verify.evidence}` : ""}\n  - ${diag}\n  - ${formatDiffStats(d)}`,
        );
        coverage.push({
          issueId: item.issueId,
          op: "merge_scenes",
          scene: `${item.sceneId}<-${item.mergeWith}`,
          status: result.verify.verdict === "FAIL" ? "failed" : "done",
          detail: `verify: ${result.verify.verdict}`,
        });
        continue;
      }

      /* ---------------- line_edit (with rewrite escalation) ------------ */
      const sceneText = await workspaceExporter.readDraft(
        story_id,
        item.sceneId,
        target_version,
      );
      if (!sceneText) {
        coverage.push({
          issueId: item.issueId,
          op: item.op,
          scene: item.sceneId,
          status: "failed",
          detail: "scene text missing in target version",
        });
        continue;
      }

      let finalText = "";
      let gateNote = "";
      let verify: VerifyResult | null = null;
      let opUsed: string = item.op;
      let editNote = "";

      if (item.op === "line_edit") {
        const editPrompt = `You are a surgical line editor. Apply the directive below to the scene via the SMALLEST possible set of anchored edits. For each edit, "find" must be an EXACT, contiguous excerpt copied verbatim from the scene (long enough to be unique — include full sentences), and "replace" is its replacement ("" to delete). Do NOT rewrite anything the directive doesn't require. Output ONLY JSON:
{ "edits": [ { "find": "exact text from the scene", "replace": "replacement text" } ] }

=== DIRECTIVE ===
${item.directive}

=== SCENE ===
${sceneText}`;
        let edits: AnchoredEdit[] = [];
        try {
          const resp = await aiRouter.generateCompletion({
            taskType: "diagnostic",
            systemPrompt: editPrompt,
            userMessage: "Output the anchored edits as JSON.",
          });
          const parsed = safeParseJson<any>(resp);
          if (parsed && Array.isArray(parsed.edits)) edits = parsed.edits;
        } catch {
          edits = [];
        }

        if (edits.length > 0) {
          const applied = applyAnchoredEdits(sceneText, edits);
          if (applied.applied > 0) {
            const gated = await runGate(applied.text, item.directive);
            const v = await verifyDirective({
              directive: item.directive,
              oldText: sceneText,
              newText: gated.text,
              opLabel: "line_edit",
            });
            editNote = `line_edit: ${applied.applied}/${edits.length} anchored edit(s) applied${applied.failed.length ? `, ${applied.failed.length} anchor(s) not found` : ""}`;
            if (v.verdict !== "FAIL") {
              finalText = gated.text;
              gateNote = gated.note;
              verify = v;
            }
          }
        }
        if (!finalText) {
          opUsed = "line_edit->rewrite";
          editNote = editNote
            ? `${editNote}; escalated to full rewrite (verification failed)`
            : "line_edit: no anchors applied; escalated to full rewrite";
        }
      }

      /* ---------------- rewrite (also line_edit escalation path) ------- */
      if (!finalText) {
        const boundary = await neighborContext(item.sceneId);
        const result = await generateVerified({
          opLabel: "rewrite",
          directive: item.directive,
          oldText: sceneText,
          buildSystemPrompt: (feedback) =>
            `You are a brilliant MFA-level editor revising ONE scene for the next draft. Apply the specific directive below, informed by the overall critique. Rewrite the entire scene from start to finish; output the full revised prose only. PRESERVE everything the directive does not require changing — this scene has survived multiple editorial rounds and its unflagged prose is presumed GOOD. CRITICAL: do not "correct" intentional stylistic choices, character voice quirks, or technical terms.

=== THIS SCENE'S REVISION DIRECTIVE ===
${item.directive}

=== OVERALL CRITIQUE (context ONLY — do not apply fixes assigned to OTHER scenes; each issue has exactly one owner scene and this scene's job is the directive above) ===
${summaryContext}

=== CRAFT DIRECTIVES (still apply while fixing the above — don't trade one pathology for another) ===
${craftDirectives}${boundary}${feedback}`,
          userMessage: `Revise this scene per the directive.\n\n=== SCENE ===\n${sceneText}`,
        });
        if (!result.text) return await abortRun(item.sceneId, result.error);
        finalText = result.text;
        gateNote = result.gateNote;
        verify = result.verify;
      }

      await workspaceExporter.saveDraft(
        story_id,
        item.sceneId,
        finalText,
        target_version,
      );
      revisedCount++;
      const diag = await rescore(item.sceneId, finalText);
      const d = lineDiffStats(sceneText, finalText);
      changelogLines.push(
        `- **[${item.issueId}]** ${opUsed} ${item.sceneId}: ${item.directive}\n${editNote ? `  - ${editNote}\n` : ""}  - ${gateNote}\n  - verify: ${verify!.verdict}${verify!.evidence ? ` — ${verify!.evidence}` : ""}${verify!.verdict === "FAIL" && verify!.remaining ? `\n  - STILL NEEDED: ${verify!.remaining}` : ""}\n  - ${diag}\n  - ${formatDiffStats(d)}`,
      );
      coverage.push({
        issueId: item.issueId,
        op: opUsed,
        scene: item.sceneId,
        status: verify!.verdict === "FAIL" ? "failed" : "done",
        detail: `verify: ${verify!.verdict}; ${formatDiffStats(d)}`,
      });
    }

    // 7. Recompile the new version's manuscript.
    const allDrafts = await workspaceExporter.readAllDrafts(
      story_id,
      target_version,
    );
    await workspaceExporter.saveManuscript(story_id, allDrafts, target_version);
    await appendChangelog("complete");

    // 8. Update the persistent cross-version issue ledger (best-effort).
    try {
      const ledger = await workspaceExporter.readIssueLedger(story_id);
      const stamp = `${source_version}->${target_version}`;
      for (const row of coverage) {
        for (const oneId of row.issueId.split("+")) {
          if (!oneId || oneId === "unknown") continue;
          let issue = ledger.issues.find((i: any) => i.id === oneId);
          if (!issue) {
            issue = {
              id: oneId,
              title: row.detail.slice(0, 120),
              first_flagged: source_version,
              status: "open",
              history: [],
            };
            ledger.issues.push(issue);
          }
          issue.history.push({
            version: stamp,
            event: `${row.op} ${row.scene}: ${row.status} (${row.detail.slice(0, 160)})`,
          });
          if (row.status === "done") issue.status = "addressed";
          else if (row.status === "failed") issue.status = "attempted";
          else if (row.status === "unactionable") issue.status = "needs-human";
        }
      }
      await workspaceExporter.saveIssueLedger(story_id, ledger);
    } catch {
      /* ledger is best-effort */
    }

    // 9. Report — including the coverage the user asked for.
    const done = coverage.filter((c) => c.status === "done").length;
    const failed = coverage.filter((c) => c.status === "failed").length;
    const unact = coverage.filter((c) => c.status === "unactionable").length;
    const coverageText = coverage
      .map(
        (c) =>
          `- [${c.issueId}] ${c.op} ${c.scene} — ${c.status.toUpperCase()}${c.detail ? ` (${c.detail})` : ""}`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Revision complete. ${target_version} written from ${source_version}: ${revisedCount} operation(s) executed across ${copiedIds.length} scenes (unflagged scenes carried forward verbatim).

COVERAGE — every critique item, honestly:
${coverageText || "(none)"}

Totals: ${done} done, ${failed} failed verification, ${unact} unactionable (needs human judgment). Full details incl. per-scene diff stats in storyscope-reports/${source_version}/changelog.md; cross-version status in storyscope-reports/issue-ledger.json.

Note: this only revises prose. If the review also flagged canon divergences worth keeping, run reconcile_storyscope_canon to update the World Bible / Architecture Brief / character records.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error running apply_storyscope_revisions: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
