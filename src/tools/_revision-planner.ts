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

/** Salvage complete items from a truncated/malformed planner response: walk
 *  the "revisions" array by brace depth and JSON.parse each complete object,
 *  so one truncated tail item doesn't discard an otherwise good plan. */
export function salvageRevisions(raw: string): RevisionPlanItem[] {
  const idx = (raw || "").indexOf('"revisions"');
  if (idx === -1) return [];
  const start = raw.indexOf("[", idx);
  if (start === -1) return [];
  const items: RevisionPlanItem[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = start + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          items.push(JSON.parse(raw.slice(objStart, i + 1)));
        } catch {
          /* skip incomplete item */
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  return items;
}

/**
 * Build the revision plan for a reviewed version from: the Executive Summary,
 * all specialist lens reports, the per-scene diagnostics digest, the issue
 * ledger + previous round's changelog (convergence context), and per-scene
 * opening excerpts. Saves the plan next to the review.
 *
 * Robustness (a silent failure here left v16 with a review but NO plan):
 * inputs are capped (lens reports, summary, ledger digest all grow across
 * rounds); compilation retries once with tighter caps + a brevity order; a
 * truncated response is SALVAGED item-by-item; and the returned note states
 * exactly what happened so callers surface it instead of swallowing it.
 */
export async function buildAndSaveRevisionPlan(
  story_id: string,
  source_version: string,
): Promise<{ plan: RevisionPlan | null; note: string }> {
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
    return { plan: null, note: `no review found for ${source_version}` };

  // INPUT CAPS: these documents grow every round (v16's lens reports totalled
  // ~200KB); uncapped they overflow the planning model and the compile dies.
  const summaryContext = (
    executiveSummary && executiveSummary.trim()
      ? executiveSummary
      : "(No executive summary file found — plan from the specialist lens reports directly.)"
  ).slice(0, 20000);
  const lensBlock = (capPerLens: number) =>
    lensReports.length > 0
      ? lensReports
          .map(
            (r) =>
              `## LENS: ${r.aspect.toUpperCase()}\n${
                r.content.length > capPerLens
                  ? `${r.content.slice(0, capPerLens)}\n[...lens truncated for planning...]`
                  : r.content
              }`,
          )
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
  if (sceneIds.length === 0)
    return { plan: null, note: "no scene drafts found" };
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
  if (excerpts.length === 0)
    return { plan: null, note: "no readable scene drafts" };

  // CONVERGENCE CONTEXT: what previous rounds deliberately did. Without this
  // the planner flip-flops (v13 added the Takehiko closure scene, v14's
  // planner cut that same scene, the v14 review flagged the hole).
  let planHistory = "";
  try {
    const ledger = await workspaceExporter.readIssueLedger(story_id);
    // Cap the ledger digest: it grows every round (90 issues by v16). The
    // planner needs all UNRESOLVED issues but only a sample of resolved ones
    // (enough to avoid re-litigating).
    const withHistory = (ledger.issues || []).filter(
      (i: any) => Array.isArray(i.history) && i.history.length,
    );
    const fmtIssue = (i: any) => {
      const h = i.history
        .slice(-2)
        .map((x: any) => `${x.version}: ${x.event}`)
        .join(" | ");
      return `- [${i.id}] (${i.status}) ${h}`;
    };
    const recent = [
      ...withHistory.filter((i: any) => i.status !== "resolved").slice(-60),
      ...withHistory.filter((i: any) => i.status === "resolved").slice(-15),
    ]
      .map(fmtIssue)
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

  const buildPrompt = (
    lensCap: number,
    extra: string,
  ) => `You are an editorial planner. The AUTHOR'S INTENT IS PRIMARY and the manuscript is the living work; the Architecture Brief / World Bible are only earlier planning drafts. Flag work ONLY for genuine CRAFT problems — the story contradicting ITSELF, an arc that doesn't pay off, pacing/clarity failures, weak execution. DO NOT flag a scene merely because it diverges from the planning documents (canon updates belong to reconcile_storyscope_canon, not here).

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
${lensBlock(lensCap)}${diagContext}${planHistory}

=== SCENES (id :: opening excerpt) ===
${excerpts.map((e) => `${e.sceneId} :: ${e.excerpt}`).join("\n\n")}${extra}`;

  // Two attempts: full-fat, then tighter inputs + a brevity order (covers both
  // failure modes — input overflow and truncated output).
  const attempts = [
    { lensCap: 12000, extra: "" },
    {
      lensCap: 4000,
      extra:
        "\n\nIMPORTANT: a previous attempt produced unparseable (likely truncated) output. Keep the TOTAL output compact: at most 25 revision items, each 'specifics' under 250 characters, no prose outside the JSON object.",
    },
  ];
  let parsed: any = null;
  let salvaged = false;
  let lastErr = "planner returned unparseable or empty output";
  for (const a of attempts) {
    try {
      const resp = await aiRouter.generateCompletion({
        taskType: "diagnostic",
        systemPrompt: buildPrompt(a.lensCap, a.extra),
        userMessage: "Output the revision plan as JSON.",
      });
      parsed = safeParseJson<any>(resp);
      if (!parsed || !Array.isArray(parsed.revisions)) {
        const items = salvageRevisions(resp || "");
        if (items.length > 0) {
          parsed = { revisions: items, unactionable: [] };
          salvaged = true;
        } else {
          parsed = null;
        }
      }
      if (parsed && Array.isArray(parsed.revisions) && parsed.revisions.length)
        break;
      parsed = null;
    } catch (e: any) {
      lastErr = e?.message || String(e);
      parsed = null;
    }
  }
  if (!parsed)
    return {
      plan: null,
      note: `plan compilation failed after ${attempts.length} attempts: ${lastErr}`,
    };

  const plan: RevisionPlan = {
    story_id,
    source_version,
    generated_at: new Date().toISOString(),
    revisions: parsed.revisions,
    unactionable: Array.isArray(parsed.unactionable) ? parsed.unactionable : [],
  };
  try {
    await workspaceExporter.saveRevisionPlan(story_id, source_version, plan);
  } catch (e: any) {
    return {
      plan,
      note: `plan compiled but SAVING FAILED: ${e?.message || e}`,
    };
  }
  return {
    plan,
    note: `compiled ${plan.revisions.length} operation(s)${plan.unactionable.length ? ` + ${plan.unactionable.length} needs-human item(s)` : ""}${salvaged ? " (salvaged from truncated planner output — review the plan for missing tail items)" : ""}`,
  };
}

/* ------------------------------------------------------------------ *
 * Standalone recovery/regeneration tool: (re)compile the plan from an
 * EXISTING review without re-running the lenses. Exists because a
 * failed compile used to leave a finished review with no plan and no
 * cheap way to get one.
 * ------------------------------------------------------------------ */

export const compileRevisionPlanDef = {
  name: "compile_revision_plan",
  description:
    "(Re)compile the revision plan from an EXISTING StoryScope review — no lenses are re-run, so this is fast and cheap. Use when a review finished but its plan failed to compile, or to regenerate the plan after review reports were edited. Overwrites storyscope-reports/<version>/revision-plan.json (the file the Studio panel shows and apply_storyscope_revisions executes).",
  inputSchema: {
    type: "object",
    properties: {
      story_id: { type: "string", description: "Identifier for the story" },
      version: {
        type: "string",
        description:
          "Reviewed version whose plan to compile (default: the latest version that has a review on disk)",
      },
    },
    required: ["story_id"],
  },
};

export async function executeCompileRevisionPlan(args: any) {
  try {
    const story_id = args.story_id;
    let version = args.version as string | undefined;
    if (!version) {
      const versions = await workspaceExporter.listDraftVersions(story_id);
      for (const v of versions.slice().reverse()) {
        const summary = await workspaceExporter.readStoryscopeExecutiveSummary(
          story_id,
          v,
        );
        const lenses = await workspaceExporter.readAllStoryscopeReports(
          story_id,
          v,
        );
        if ((summary && summary.trim()) || lenses.length > 0) {
          version = v;
          break;
        }
      }
    }
    if (!version) {
      return {
        content: [
          {
            type: "text",
            text: `Error: no version of ${story_id} has a StoryScope review on disk. Run storyscope_final_review first.`,
          },
        ],
        isError: true,
      };
    }
    const { plan, note } = await buildAndSaveRevisionPlan(story_id, version);
    if (!plan) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to compile revision plan for ${version}: ${note}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Revision plan for ${version}: ${note}. Saved to storyscope-reports/${version}/revision-plan.json — review/edit it in the Studio, then run apply_storyscope_revisions.`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error compiling revision plan: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
