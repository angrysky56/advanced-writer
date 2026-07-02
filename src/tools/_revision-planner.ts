import { aiRouter } from "../ai/router.js";
import { workspaceExporter } from "../storage/workspace.js";
import { safeParseJson } from "../ai/extract.js";
import { diagnosticsDigest } from "./_revision-support.js";

/**
 * The compiled REVISION PLAN — one editorial planning step shared by the whole
 * loop. storyscope_final_review builds and saves it at the end of every review
 * (storyscope-reports/<version>/revision-plan.json); the Studio renders/edits
 * that file; apply_storyscope_revisions consumes it. This replaces re-planning
 * inside apply, so what the user reads is exactly what gets executed.
 */

export interface RevisionPlanItem {
  issue_id?: string;
  op?: string;
  scene_id?: string;
  merge_with?: string;
  after_scene?: string;
  directive?: string;
  specifics?: string;
}

export interface RevisionPlan {
  story_id: string;
  source_version: string;
  generated_at: string;
  revisions: RevisionPlanItem[];
  /** Items deferred to human judgment. The Studio lets the author type a
   *  'resolution' (their decision); apply_storyscope_revisions decomposes any
   *  resolved item into concrete operations at apply time. */
  unactionable: { issue_id?: string; reason?: string; resolution?: string }[];
}

/**
 * Build the revision plan for a reviewed version from: the Executive Summary,
 * all specialist lens reports, the per-scene diagnostics digest, the issue
 * ledger + previous round's changelog (convergence context), and per-scene
 * opening excerpts. Saves the plan next to the review. Returns null when no
 * review or no scenes exist. Fail-open — callers treat null as "no plan yet".
 */
export async function buildAndSaveRevisionPlan(
  story_id: string,
  source_version: string,
): Promise<RevisionPlan | null> {
  const executiveSummary =
    await workspaceExporter.readStoryscopeExecutiveSummary(
      story_id,
      source_version,
    );
  const lensReports = await workspaceExporter.readAllStoryscopeReports(
    story_id,
    source_version,
  );
  if (
    !(executiveSummary && executiveSummary.trim()) &&
    lensReports.length === 0
  )
    return null;

  const summaryContext =
    executiveSummary && executiveSummary.trim()
      ? executiveSummary
      : "(No executive summary file found — plan from the specialist lens reports directly.)";
  const lensContext =
    lensReports.length > 0
      ? lensReports
          .map((r) => `## LENS: ${r.aspect.toUpperCase()}\n${r.content}`)
          .join("\n\n")
      : "(no specialist lens reports found)";

  // Scene set + opening excerpts.
  let sceneFiles = await workspaceExporter.listDrafts(story_id, source_version);
  if (sceneFiles.length === 0)
    sceneFiles = await workspaceExporter.listDrafts(story_id, "v1");
  const sceneIds = sceneFiles
    .map((f) => f.replace(".md", ""))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
  if (sceneIds.length === 0) return null;
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
  if (excerpts.length === 0) return null;

  // CONVERGENCE CONTEXT: what previous rounds deliberately did. Without this
  // the planner flip-flops (v13 added the Takehiko closure scene, v14's
  // planner cut that same scene, the v14 review flagged the hole).
  let planHistory = "";
  try {
    const ledger = await workspaceExporter.readIssueLedger(story_id);
    const recent = (ledger.issues || [])
      .filter((i: any) => Array.isArray(i.history) && i.history.length)
      .map((i: any) => {
        const h = i.history
          .slice(-2)
          .map((x: any) => `${x.version}: ${x.event}`)
          .join(" | ");
        return `- [${i.id}] (${i.status}) ${h}`;
      })
      .join("\n");
    const prevChangelog = await workspaceExporter.readStoryscopeChangelog(
      story_id,
      `v${(parseInt(source_version.replace(/\D/g, ""), 10) || 1) - 1}`,
    );
    if (recent || prevChangelog) {
      planHistory = `\n\n=== PRIOR ROUNDS (what earlier revisions DELIBERATELY did — do not silently undo it) ===\n${recent ? `ISSUE LEDGER:\n${recent}\n` : ""}${prevChangelog ? `\nPREVIOUS ROUND'S CHANGELOG:\n${prevChangelog.slice(-6000)}` : ""}`;
    }
  } catch {
    planHistory = "";
  }

  // SCENE DIAGNOSTICS: the neurochemical scores + pathology flags the author
  // sees in the Studio Inspector — standing warnings the plan must own.
  let diagContext = "";
  try {
    const diags = await workspaceExporter.readAllDiagnostics(story_id);
    const digest = diagnosticsDigest(diags);
    if (digest) {
      diagContext = `\n\n=== SCENE DIAGNOSTICS (neurochemical scores 1-10 + pathology flags; reflects each scene's most recent scoring) ===\n${digest}\n\nPathology flags (Flatlining Dopamine, Somatic Metaphor Cliché, Telling Not Showing, etc.) are standing craft warnings the author SEES in the Studio — treat a flagged pathology as a critique item and assign an operation for it (usually line_edit, or fold it into a scene's existing directive) UNLESS the lens reports establish the quality is intentional (a deliberately quiet scene may legitimately run low cortisol/dopamine — do not inflate every scene). When you fix a flagged scene, name the pathology in the directive so verification can target it.`;
    }
  } catch {
    diagContext = "";
  }

  const planPrompt = `You are an editorial planner. The AUTHOR'S INTENT IS PRIMARY and the manuscript is the living work; the Architecture Brief / World Bible are only earlier planning drafts. Flag work ONLY for genuine CRAFT problems — the story contradicting ITSELF, an arc that doesn't pay off, pacing/clarity failures, weak execution. DO NOT flag a scene merely because it diverges from the planning documents (canon updates belong to reconcile_storyscope_canon, not here).

You have SIX operations. Choose the one that actually executes each critique item:
- "rewrite": full-scene revision — for pacing, structure, POV, or emotional-beat problems within ONE scene.
- "line_edit": surgical anchored edits — for LOCAL fixes (a factual/continuity error, an over-repeated description, an explanatory sentence to cut, an actors_table DEMAND for one physical beat). STRONGLY PREFER this when the fix is local: it preserves polished prose by construction.
- "global_line_edit": the SAME surgical directive applied across EVERY scene (set scene_id to "all") — for manuscript-wide line passes: verb-tense drag, thematic over-explication, a stylistic crutch ("and yet"), an over-repeated motif description. These are NOT unactionable — this op exists precisely for them.
- "cut_scene": remove a scene the critique identifies as redundant (scene_id = the scene to cut).
- "merge_scenes": fuse two scenes into one (scene_id = the surviving scene, merge_with = the scene absorbed into it).
- "add_scene": a genuinely NEW scene the critique calls for (after_scene = the scene it follows; scene_id may repeat after_scene). Arc-closure scenes ("write the scene where X happens") belong here — they are actionable.

For every item ALSO provide "specifics": VERBATIM excerpts from the specialist lens reports (actors_table DEMAND lines, style citations, quoted passages, sensory details the specialists prescribed) that the executor must honor. The one-sentence directive says WHAT; the specifics carry the DEPTH — without them the edit goes shallow.

HARD RULES:
1. Each critique issue is owned by EXACTLY ONE operation. NEVER assign the same fix to two scenes — duplicated fixes create the repetition the next review will flag.
2. Give every item a short stable kebab-case "issue_id" — REUSE the id from the ISSUE LEDGER when it is the same underlying issue.
3. Scenes that already work must NOT be touched.
4. CONVERGENCE: do NOT cut or gut something a previous round deliberately added, and do NOT re-add what a previous round deliberately cut, unless the critique EXPLICITLY says the previous decision was wrong — in that case prefix the directive with "REVERSAL:" and quote the critique's justification. When two critique items conflict (e.g. "compress the denouement" vs "keep the closure scene"), resolve the conflict yourself in favor of the more specific item and note the tradeoff in the directive — do not execute both halves of a contradiction.
5. "unactionable" is a LAST RESORT — only for pure taste decisions where no option is clearly better. Global style passes are global_line_edit. Missing scenes are add_scene. Placement judgment calls: choose the best placement yourself and state it. NEVER list an issue as unactionable while also emitting an operation for it.
6. Prior rounds' "needs-human"/"unactionable" classifications in the ISSUE LEDGER DO NOT bind you — the operation set has grown since they were written. Re-evaluate every open issue against the CURRENT six operations. Verb-tense drag, thematic over-explication, stylistic crutches, and over-repeated motif descriptions are ALWAYS global_line_edit now — never unactionable, never "requires an authorial pass": finding every instance and rewriting it line-by-line is exactly what global_line_edit does.
7. STRUCTURAL issues (revelation timing, restructuring an act, re-sequencing the middle) — do NOT punt. Decompose YOUR best structural solution into a concrete sequence of operations (cut/merge/add/rewrite items sharing an issue_id prefix, e.g. "curiosity-spiral-1", "curiosity-spiral-2"), each directive stating its role in the restructure and the intended event order. If you genuinely cannot choose between two structural solutions, the "unactionable" reason MUST present both options concretely with your recommendation — the author decides between real choices, never receives a blank "requires authorial judgment".

Output ONLY JSON:
{ "revisions": [ { "issue_id": "...", "op": "rewrite|line_edit|global_line_edit|cut_scene|merge_scenes|add_scene", "scene_id": "scene_3 (or \\"all\\" for global_line_edit)", "merge_with": "(merge only)", "after_scene": "(add only)", "directive": "the specific change", "specifics": "verbatim lens-report excerpts to honor" } ],
  "unactionable": [ { "issue_id": "...", "reason": "..." } ] }

=== EXECUTIVE SUMMARY ===
${summaryContext}

=== SPECIALIST LENS REPORTS ===
${lensContext}${diagContext}${planHistory}

=== SCENES (id :: opening excerpt) ===
${excerpts.map((e) => `${e.sceneId} :: ${e.excerpt}`).join("\n\n")}`;

  let parsed: any = null;
  try {
    const resp = await aiRouter.generateCompletion({
      taskType: "diagnostic",
      systemPrompt: planPrompt,
      userMessage: "Output the revision plan as JSON.",
    });
    parsed = safeParseJson<any>(resp);
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.revisions)) return null;

  const plan: RevisionPlan = {
    story_id,
    source_version,
    generated_at: new Date().toISOString(),
    revisions: parsed.revisions,
    unactionable: Array.isArray(parsed.unactionable) ? parsed.unactionable : [],
  };
  try {
    await workspaceExporter.saveRevisionPlan(story_id, source_version, plan);
  } catch {
    /* plan file is best-effort; the returned object still works */
  }
  return plan;
}
